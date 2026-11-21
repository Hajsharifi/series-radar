//! Rust port of the Film2Media HTML parser (`series_radar/downloads.py`).
//!
//! The public functions intentionally accept and return `serde_json::Value`:
//! the generated PyO3 bindings preserve the Python API and the recorded
//! characterization cases, including error behavior on invalid arguments.

#![forbid(unsafe_code)]

use once_cell::sync::Lazy;
use regex::{Regex, RegexBuilder};
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use std::borrow::Cow;
use std::collections::{BTreeMap, HashMap, HashSet};

const VOID_TAGS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
static SPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
static DOWNLOAD_RE: Lazy<Regex> = Lazy::new(|| {
    RegexBuilder::new(r#"handleDownloadClick\(\s*['"]([^'"]+)['"]"#)
        .case_insensitive(true)
        .build()
        .unwrap()
});
static MEDIA_EXT_RE: Lazy<Regex> = Lazy::new(|| {
    RegexBuilder::new(r"\.(mkv|mp4|mov|avi|webm|m4v|ts)(\?|$)")
        .case_insensitive(true)
        .build()
        .unwrap()
});
static CLASS_RE: Lazy<Regex> = Lazy::new(|| {
    RegexBuilder::new(r#"class\s*=\s*[\"']([^\"']*)[\"']"#)
        .case_insensitive(true)
        .build()
        .unwrap()
});
static ATTR_HREF_RE: Lazy<Regex> = Lazy::new(|| attr_pattern("href"));
static ATTR_ONCLICK_RE: Lazy<Regex> = Lazy::new(|| attr_pattern("onclick"));
static LABEL_QUALITY_RE: Lazy<Regex> = Lazy::new(|| label_pattern("کیفیت"));
static LABEL_ENCODER_RE: Lazy<Regex> = Lazy::new(|| label_pattern("انکودر"));
static LABEL_NOTE_RE: Lazy<Regex> = Lazy::new(|| label_pattern("توضیحات"));
static LABEL_SIZE_RE: Lazy<Regex> = Lazy::new(|| label_pattern("میانگین حجم"));
static OPEN_DIV_RE: Lazy<Regex> = Lazy::new(|| open_tag_pattern("div"));
static CLOSE_DIV_RE: Lazy<Regex> = Lazy::new(|| close_tag_pattern("div"));
static OPEN_A_RE: Lazy<Regex> = Lazy::new(|| open_tag_pattern("a"));
static CLOSE_A_RE: Lazy<Regex> = Lazy::new(|| close_tag_pattern("a"));
static OPEN_P_RE: Lazy<Regex> = Lazy::new(|| open_tag_pattern("p"));
static CLOSE_P_RE: Lazy<Regex> = Lazy::new(|| close_tag_pattern("p"));
static OPEN_LI_RE: Lazy<Regex> = Lazy::new(|| open_tag_pattern("li"));
static CLOSE_LI_RE: Lazy<Regex> = Lazy::new(|| close_tag_pattern("li"));
static DIV_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<div\b[^>]*>").unwrap());
static SEASON_EPISODE_RE: Lazy<Regex> = Lazy::new(|| {
    RegexBuilder::new(r"(?:^|[^a-z0-9])[sS](\d{1,2})[eE](\d{1,3})(?:[^0-9]|$)")
        .case_insensitive(true)
        .build()
        .unwrap()
});
static SEASON_BOX_RE: Lazy<Regex> = Lazy::new(|| {
    RegexBuilder::new(r#"data-bs-target\s*=\s*[\"']#(season-dlbox\d+)"#)
        .build()
        .unwrap()
});
static EPISODE_TEXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"قسمت\s*(\d+)").unwrap());
static SEASON_TEXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"فصل\s*(\d+|[^\s]+)").unwrap());

fn py_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "NoneType",
        Value::Bool(_) => "bool",
        Value::Number(n) if n.is_i64() || n.is_u64() => "int",
        Value::Number(_) => "float",
        Value::String(_) => "str",
        Value::Array(_) => "list",
        Value::Object(_) => "dict",
    }
}

fn expected_string(value: &Value) -> String {
    format!(
        "TypeError: expected string or bytes-like object, got '{}'",
        py_type(value)
    )
}

fn concat_error(value: &Value) -> String {
    format!(
        "TypeError: can only concatenate str (not \"{}\") to str",
        py_type(value)
    )
}

fn as_html(value: &Value) -> Result<&str, String> {
    value.as_str().ok_or_else(|| expected_string(value))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(n) => n.as_f64().is_some_and(|v| v != 0.0),
        Value::String(v) => !v.is_empty(),
        Value::Array(v) => !v.is_empty(),
        Value::Object(v) => !v.is_empty(),
    }
}

fn sha_hex(text: &str, len: usize) -> String {
    let digest = Sha1::digest(text.as_bytes());
    digest[..8]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()[..len]
        .to_string()
}

fn group_id(parts: &[&str]) -> String {
    sha_hex(&parts.join("|"), 12)
}

fn py_tuple(values: Vec<Value>) -> Value {
    let mut map = Map::new();
    map.insert("$tuple".into(), Value::Array(values));
    Value::Object(map)
}

fn char_count(text: &str) -> usize {
    text.chars().count()
}

fn first_chars(text: &str, count: usize) -> String {
    text.chars().take(count).collect()
}

fn clean_text(fragment: &str) -> String {
    let text = TAG_RE.replace_all(fragment, " ");
    let text = html_escape::decode_html_entities(&text);
    SPACE_RE.replace_all(&text, " ").trim().to_string()
}

#[derive(Clone, Debug)]
struct Token {
    start: usize,
    end: usize,
    attrs_start: usize,
    attrs_end: usize,
    closing: bool,
    self_closing: bool,
}

fn open_tag_pattern(tag: &str) -> Regex {
    RegexBuilder::new(&format!(r"<{}\b([^>]*)>", regex::escape(tag)))
        .case_insensitive(true)
        .build()
        .unwrap()
}

fn close_tag_pattern(tag: &str) -> Regex {
    RegexBuilder::new(&format!(r"<\s*(/?)\s*{}\b([^>]*)>", regex::escape(tag)))
        .case_insensitive(true)
        .build()
        .unwrap()
}

fn tag_pattern(tag: &str, closing: bool) -> Cow<'static, Regex> {
    match (tag.to_ascii_lowercase().as_str(), closing) {
        ("div", false) => Cow::Borrowed(&*OPEN_DIV_RE),
        ("div", true) => Cow::Borrowed(&*CLOSE_DIV_RE),
        ("a", false) => Cow::Borrowed(&*OPEN_A_RE),
        ("a", true) => Cow::Borrowed(&*CLOSE_A_RE),
        ("p", false) => Cow::Borrowed(&*OPEN_P_RE),
        ("p", true) => Cow::Borrowed(&*CLOSE_P_RE),
        ("li", false) => Cow::Borrowed(&*OPEN_LI_RE),
        ("li", true) => Cow::Borrowed(&*CLOSE_LI_RE),
        _ if closing => Cow::Owned(close_tag_pattern(tag)),
        _ => Cow::Owned(open_tag_pattern(tag)),
    }
}

fn next_token(html: &str, tag: &str, from: usize, opening: bool) -> Option<Token> {
    let pattern = tag_pattern(tag, !opening);
    let captures = pattern.captures_at(html, from)?;
    let whole = captures.get(0)?;
    let attrs = if opening {
        captures.get(1)
    } else {
        captures.get(2)
    }?;
    let closing = !opening
        && captures
            .get(1)
            .is_some_and(|part| !part.as_str().is_empty());
    let outer = &html[whole.start()..whole.end()];
    Some(Token {
        start: whole.start(),
        end: whole.end(),
        attrs_start: attrs.start(),
        attrs_end: attrs.end(),
        closing,
        self_closing: outer.trim_end().ends_with('/') || VOID_TAGS.contains(&tag),
    })
}

fn close_after(html: &str, start: usize, tag: &str) -> Option<Token> {
    let mut depth = 0_i32;
    let mut pos = start;
    while let Some(token) = next_token(html, tag, pos, false)
        && pos < html.len()
    {
        if token.closing {
            depth -= 1;
            if depth < 0 {
                return Some(token);
            }
        } else if !token.self_closing {
            depth += 1;
        }
        pos = token.end;
    }
    None
}

#[derive(Clone, Debug)]
struct Element {
    start: usize,
    end: usize,
    outer: String,
    inner: String,
}

fn element_matches(html: &str, tag: &str, class_name: Option<&str>) -> Vec<Element> {
    let mut result = Vec::new();
    let mut pos = 0;
    while let Some(open) = next_token(html, tag, pos, true) {
        pos = open.end;
        if open.closing {
            continue;
        }
        if let Some(required) = class_name.filter(|name| !name.is_empty()) {
            let attrs = &html[open.attrs_start..open.attrs_end];
            let class_value = CLASS_RE
                .captures(attrs)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str())
                .unwrap_or("");
            let matches = class_value
                .split_whitespace()
                .any(|token| token == required);
            if !matches {
                continue;
            }
        }
        let Some(close) = close_after(html, open.end, tag) else {
            continue;
        };
        result.push(Element {
            start: open.start,
            end: close.end,
            outer: html[open.start..close.end].to_string(),
            inner: html[open.end..close.end].to_string(),
        });
    }
    result
}

fn first_tag(html: &str, tag: &str, class_name: Option<&str>) -> Option<Element> {
    element_matches(html, tag, class_name).into_iter().next()
}

fn attr_pattern(name: &str) -> Regex {
    RegexBuilder::new(&format!(
        r#"\b{}\s*=\s*(?:\"(.*?)\"|'(.*?)')"#,
        regex::escape(name)
    ))
    .case_insensitive(true)
    .dot_matches_new_line(true)
    .build()
    .unwrap()
}

fn attr_with_pattern(tag_html: &str, pattern: &Regex) -> String {
    pattern
        .captures(tag_html)
        .and_then(|caps| caps.get(1).or_else(|| caps.get(2)))
        .map(|m| html_escape::decode_html_entities(m.as_str()).to_string())
        .unwrap_or_default()
}

fn attr(tag_html: &str, name: &str) -> String {
    match name {
        "href" => attr_with_pattern(tag_html, &ATTR_HREF_RE),
        "onclick" => attr_with_pattern(tag_html, &ATTR_ONCLICK_RE),
        other => attr_with_pattern(tag_html, &attr_pattern(other)),
    }
}

fn label_pattern(label: &str) -> Regex {
    RegexBuilder::new(&format!(
        r"<span[^>]*>\s*{}\s*:?\s*</span>",
        regex::escape(label)
    ))
    .case_insensitive(true)
    .dot_matches_new_line(true)
    .build()
    .unwrap()
}

fn label_with_pattern(fragment: &str, pattern: &Regex) -> String {
    let Some(caps) = pattern.captures(fragment) else {
        return String::new();
    };
    let start = caps.get(0).map(|m| m.end()).unwrap_or(fragment.len());
    let rest = &fragment[start..];
    // The original uses a non-greedy capture followed by (?=<div|</div>|$).
    let end = [rest.find("<div"), rest.find("</div>"), Some(rest.len())]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(rest.len());
    let value = clean_text(&rest[..end]);
    let value = value.trim_matches([' ', ':', '\u{00a0}']).to_string();
    if matches!(value.as_str(), "—" | "-" | "&mdash;") {
        String::new()
    } else {
        value
    }
}

fn label_value(fragment: &str, label: &str) -> String {
    match label {
        "کیفیت" => label_with_pattern(fragment, &LABEL_QUALITY_RE),
        "انکودر" => label_with_pattern(fragment, &LABEL_ENCODER_RE),
        "توضیحات" => label_with_pattern(fragment, &LABEL_NOTE_RE),
        "میانگین حجم" => label_with_pattern(fragment, &LABEL_SIZE_RE),
        other => label_with_pattern(fragment, &label_pattern(other)),
    }
}

#[derive(Debug, PartialEq)]
struct UrlParts<'a> {
    scheme: &'a str,
    netloc: &'a str,
    path: &'a str,
}

fn url_parts(url: &str) -> UrlParts<'_> {
    let end = url.find(['?', '#']).unwrap_or(url.len());
    let prefix = &url[..end];
    let (scheme, rest) = prefix
        .find(':')
        .filter(|colon| {
            prefix[..*colon].chars().enumerate().all(|(i, c)| {
                if i == 0 {
                    c.is_ascii_alphabetic()
                } else {
                    c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')
                }
            })
        })
        .map_or(("", prefix), |colon| {
            (&prefix[..colon], &prefix[colon + 1..])
        });
    if let Some(authority) = rest.strip_prefix("//") {
        let authority_end = authority.find('/').unwrap_or(authority.len());
        UrlParts {
            scheme,
            netloc: &authority[..authority_end],
            path: &authority[authority_end..],
        }
    } else {
        UrlParts {
            scheme,
            netloc: "",
            path: rest,
        }
    }
}

fn clean_url(url: &str) -> String {
    let parts = url_parts(url);
    let mut clean = String::new();
    if !parts.scheme.is_empty() {
        clean.push_str(&parts.scheme.to_lowercase());
        clean.push(':');
    }
    if !parts.netloc.is_empty() {
        clean.push_str("//");
        clean.push_str(parts.netloc);
    }
    clean.push_str(parts.path);
    clean
}

fn is_media_url(url: &str) -> bool {
    if url.is_empty()
        || url.starts_with('#')
        || url.contains("playit=")
        || url.contains("require-login")
    {
        return false;
    }
    let parts = url_parts(url);
    if !parts.scheme.eq_ignore_ascii_case("http") && !parts.scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let host = parts.netloc.to_ascii_lowercase();
    if host.contains("subzone") || host.contains("myf2ms.top") {
        return false;
    }
    MEDIA_EXT_RE.is_match(parts.path)
        || host.contains("abrtech.top")
        || host.contains("mehracdn.com")
}

fn filename_from_url(url: &str) -> String {
    let path = url_parts(url).path;
    path.rsplit('/')
        .next()
        .map(|part| {
            percent_encoding::percent_decode_str(part)
                .decode_utf8_lossy()
                .to_string()
        })
        .unwrap_or_default()
}

#[derive(Debug)]
struct Link {
    id: String,
    url: String,
    label: String,
    filename: String,
}

impl Link {
    fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "url": self.url,
            "label": self.label,
            "filename": self.filename,
        })
    }
}

fn links(fragment: &Element, preferred_label: &str) -> Result<Vec<Link>, String> {
    let mut by_url: HashMap<String, Link> = HashMap::new();
    for anchor in element_matches(&fragment.inner, "a", None) {
        let tag = anchor.outer.split('>').next().unwrap_or("").to_string() + ">";
        let href = attr(&tag, "href");
        let mut candidates = Vec::new();
        if is_media_url(&href) {
            candidates.push(href);
        }
        let onclick = attr(&tag, "onclick");
        for capture in DOWNLOAD_RE.captures_iter(&onclick) {
            let quoted = capture.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
            if is_media_url(&quoted) {
                candidates.push(quoted);
            }
        }
        if candidates.is_empty() {
            continue;
        }
        let label = {
            let value = clean_text(&anchor.inner);
            if value.is_empty() {
                preferred_label.to_string()
            } else {
                value
            }
        };
        for url in candidates {
            let id = sha_hex(url.split(['?', '#']).next().unwrap_or(""), 16);
            let replacement = by_url
                .get(&id)
                .is_none_or(|old| old.label.is_empty() && !label.is_empty());
            if replacement {
                by_url.insert(
                    id.clone(),
                    Link {
                        id,
                        filename: filename_from_url(&url),
                        url,
                        label: if label.is_empty() {
                            "دانلود".into()
                        } else {
                            label.clone()
                        },
                    },
                );
            }
        }
    }
    Ok(by_url.into_values().collect())
}

fn link_meta(links: &[Link]) -> (Option<i64>, Option<i64>) {
    for link in links {
        if let Some(caps) = SEASON_EPISODE_RE.captures(&link.filename) {
            let season = caps.get(1).and_then(|m| m.as_str().parse().ok());
            let number = caps.get(2).and_then(|m| m.as_str().parse().ok());
            return (season, number);
        }
    }
    (None, None)
}

fn variant_kind(outer: &str) -> String {
    DIV_RE
        .find(outer)
        .map(|tag| attr(tag.as_str(), "class").to_lowercase())
        .unwrap_or_default()
        .split_whitespace()
        .find_map(|class| {
            ["dubbled", "hardsub", "softsub"]
                .contains(&class)
                .then_some(class.to_string())
        })
        .unwrap_or_default()
}

/// Port of `fingerprint` (`series_radar/downloads.py:67`).
pub fn fingerprint(url: Value) -> Result<Value, String> {
    if !truthy(&url) {
        return Ok(Value::String(sha_hex("", 16)));
    }
    match &url {
        Value::Array(_) => return Err("TypeError: unhashable type: 'list'".into()),
        Value::Object(_) => return Err("TypeError: unhashable type: 'dict'".into()),
        Value::Bool(_) => {
            return Err("AttributeError: 'bool' object has no attribute 'decode'".into());
        }
        Value::Number(_) => {
            return Err("AttributeError: 'int' object has no attribute 'decode'".into());
        }
        Value::String(_) => {}
        Value::Null => {
            return Err("AttributeError: 'NoneType' object has no attribute 'decode'".into());
        }
    }
    let url = url.as_str().unwrap_or("");
    let clean = clean_url(url);
    Ok(Value::String(sha_hex(&clean, 16)))
}

/// Port of `elements` (`series_radar/downloads.py:137`).
pub fn elements(html: Value, tag: Value, class_name: Option<Value>) -> Result<Value, String> {
    let tag = tag.as_str().ok_or_else(|| concat_error(&tag))?;
    let html = as_html(&html)?;
    let class = class_name
        .as_ref()
        .map(|value| value.as_str().ok_or_else(|| expected_string(value)))
        .transpose()?;
    let found = element_matches(html, tag, class);
    Ok(Value::Array(
        found
            .into_iter()
            .map(|element| {
                py_tuple(vec![
                    json!(char_count(&html[..element.start])),
                    json!(char_count(&html[..element.end])),
                    Value::String(element.outer),
                    Value::String(element.inner),
                ])
            })
            .collect(),
    ))
}

/// Port of `parse_movie_page` (`series_radar/downloads.py:216`).
pub fn parse_movie_page(page_html: Value) -> Result<Value, String> {
    let html = as_html(&page_html)?;
    let mut groups = Vec::new();
    let mut seen_groups = HashSet::new();
    for block in element_matches(html, "div", Some("download-list")) {
        let title = first_tag(&block.inner, "p", Some("title"));
        let label = title.map_or_else(|| "دانلود".into(), |node| clean_text(&node.inner));
        let kind = variant_kind(&block.outer);
        let group_key = group_id(&[&kind, &label, "movie"]);
        if !seen_groups.insert(group_key.clone()) {
            continue;
        }
        let mut items = Vec::new();
        for li in element_matches(&block.inner, "li", None) {
            let quality = label_value(&li.inner, "کیفیت");
            if quality.is_empty() {
                continue;
            }
            let li_links = links(&li, "دانلود مستقیم")?;
            if li_links.is_empty() {
                continue;
            }
            let mut seen_links = HashSet::new();
            let unique: Vec<Value> = li_links
                .into_iter()
                .filter(|link| seen_links.insert(link.id.clone()))
                .map(|link| link.to_json())
                .collect();
            let encoder = label_value(&li.inner, "انکودر");
            items.push(json!({
                "id": group_id(&[&kind, &quality, if encoder.is_empty() { "unknown" } else { &encoder }, "movie"]),
                "quality": quality,
                "encoder": encoder,
                "note": label_value(&li.inner, "توضیحات"),
                "size": label_value(&li.inner, "میانگین حجم"),
                "links": unique,
            }));
        }
        if !items.is_empty() {
            groups.push(json!({
                "id": group_key,
                "label": label,
                "kind": kind,
                "items": items,
            }));
        }
    }
    Ok(Value::Array(groups))
}

fn persian_season(raw: &str) -> Option<i64> {
    match raw {
        "اول" | "اولین" => Some(1),
        "دوم" | "دومین" => Some(2),
        "سوم" | "سومین" => Some(3),
        "چهارم" | "چهارمین" => Some(4),
        "پنجم" | "پنجمین" => Some(5),
        "ششم" => Some(6),
        "هفتم" => Some(7),
        "هشتم" => Some(8),
        "نهم" => Some(9),
        "دهم" => Some(10),
        _ => raw.parse().ok(),
    }
}

fn season_from_label(label: &str) -> Option<i64> {
    SEASON_TEXT_RE
        .captures(label)
        .and_then(|caps| caps.get(1))
        .and_then(|m| persian_season(m.as_str()))
}

fn heading_for(page_html: &str, box_id: &str) -> String {
    let pattern = RegexBuilder::new(&format!(
        r#"<button\b[^>]*data-bs-target\s*=\s*[\"']#{}[\"'][^>]*>(.*?)</button>"#,
        regex::escape(box_id)
    ))
    .case_insensitive(true)
    .dot_matches_new_line(true)
    .build()
    .unwrap();
    pattern
        .captures(page_html)
        .and_then(|caps| caps.get(1))
        .map(|m| clean_text(m.as_str()))
        .unwrap_or_default()
}

#[derive(Debug)]
struct Episode {
    season: i64,
    number: i64,
    quality: String,
    encoder: String,
    size: String,
    links: Vec<Link>,
}

impl Episode {
    fn to_json(&self) -> Value {
        json!({
            "season": self.season,
            "number": self.number,
            "label": format!("قسمت {:02}", self.number),
            "quality": self.quality,
            "encoder": self.encoder,
            "size": self.size,
            "links": self.links.iter().map(Link::to_json).collect::<Vec<_>>(),
        })
    }
}

/// Port of `parse_series_page` (`series_radar/downloads.py:290`).
pub fn parse_series_page(page_html: Value) -> Result<Value, String> {
    let html = as_html(&page_html)?;
    let mut seasons = Vec::new();
    let mut seen_variants = HashSet::new();

    for season in element_matches(html, "div", Some("download-season")) {
        let box_id = SEASON_BOX_RE
            .captures(&season.outer)
            .and_then(|caps| caps.get(1))
            .map(|m| m.as_str().to_string());
        let heading = box_id
            .as_deref()
            .map_or_else(String::new, |id| heading_for(html, id));
        let season_fallback = season_from_label(&heading);
        let mut groups = Vec::new();
        let mut seen_groups = HashSet::new();

        for block in element_matches(&season.inner, "div", Some("download-list")) {
            let kind = variant_kind(&block.outer);
            let title = first_tag(&block.inner, "p", Some("title"));
            let label = title.map_or_else(|| "دانلود".into(), |node| clean_text(&node.inner));
            let fallback_text = season_fallback.map_or_else(String::new, |n| n.to_string());
            let group_key = group_id(&[&kind, &label, "series", &fallback_text]);
            if !seen_groups.insert(group_key.clone()) {
                continue;
            }
            let mut episodes: BTreeMap<(i64, i64, String), Episode> = BTreeMap::new();

            for li in element_matches(&block.inner, "li", None) {
                let quality = label_value(&li.inner, "کیفیت");
                if quality.is_empty() {
                    continue;
                }
                let mut rows = Vec::new();
                let mut seen_starts = HashSet::new();
                for row in element_matches(&li.inner, "div", Some("d-flex")) {
                    let start = first_chars(&row.inner, 100);
                    if seen_starts.contains(&start) {
                        continue;
                    }
                    if !links(&row, "").unwrap_or_default().is_empty() {
                        seen_starts.insert(start);
                        rows.push(row);
                    }
                }
                if rows.is_empty() {
                    rows.push(li.clone());
                }
                for row in rows {
                    let row_links = links(&row, "")?;
                    if row_links.is_empty() {
                        continue;
                    }
                    let (season_from_link, episode_from_link) = link_meta(&row_links);
                    let season_no = season_from_link.or(season_fallback).unwrap_or(0);
                    let episode_no = episode_from_link.unwrap_or_else(|| {
                        EPISODE_TEXT_RE
                            .captures(&clean_text(&row.inner))
                            .and_then(|caps| caps.get(1))
                            .and_then(|m| m.as_str().parse().ok())
                            .unwrap_or(0)
                    });
                    let key = (season_no, episode_no, quality.clone());
                    if let Some(entry) = episodes.get_mut(&key) {
                        for link in row_links {
                            if !entry.links.iter().any(|old| old.id == link.id) {
                                entry.links.push(link);
                            }
                        }
                        continue;
                    }
                    episodes.insert(
                        key.clone(),
                        Episode {
                            season: season_no,
                            number: episode_no,
                            quality: quality.clone(),
                            encoder: label_value(&li.inner, "انکودر"),
                            size: label_value(&li.inner, "میانگین حجم"),
                            links: row_links,
                        },
                    );
                }
            }
            if !episodes.is_empty() {
                let mut qualities: Vec<String> =
                    episodes.values().map(|ep| ep.quality.clone()).collect();
                qualities.sort();
                qualities.dedup();
                groups.push(json!({
                    "id": group_key,
                    "label": label,
                    "kind": kind,
                    "quality": qualities,
                    "episodes": episodes.into_values().map(|ep| ep.to_json()).collect::<Vec<_>>(),
                }));
            }
        }

        if groups.is_empty() {
            continue;
        }
        let mut number = None;
        'outer: for group in &groups {
            if let Some(eps) = group.get("episodes").and_then(Value::as_array) {
                for episode in eps {
                    if let Some(season) = episode
                        .get("season")
                        .and_then(Value::as_i64)
                        .filter(|n| *n != 0)
                    {
                        number = Some(season);
                        break 'outer;
                    }
                }
            }
        }
        let number = number.or(season_fallback).unwrap_or(0);
        let mut kinds: Vec<String> = groups
            .iter()
            .filter_map(|group| {
                group
                    .get("kind")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect();
        kinds.sort();
        let variant_key = format!("{number}:{}", kinds.join(","));
        if !seen_variants.insert(variant_key) {
            continue;
        }
        let label = if heading.is_empty() {
            if number == 0 {
                "فصل".to_string()
            } else {
                format!("فصل {number}")
            }
        } else {
            heading
        };
        seasons.push((
            number,
            json!({ "number": number, "label": label, "groups": groups }),
        ));
    }
    seasons.sort_by_key(|(number, _)| *number);
    Ok(Value::Array(
        seasons.into_iter().map(|(_, value)| value).collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_removes_query_and_fragment() {
        let a = fingerprint(json!("https://host/p/S01E01.mkv?v=111")).unwrap();
        let b = fingerprint(json!("https://host/p/S01E01.mkv?v=999#x")).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, fingerprint(json!("https://host/p/S01E02.mkv")).unwrap());
    }

    #[test]
    fn elements_balances_nested_tags_and_class_filters() {
        let out = elements(
            json!(r#"<div class="x"><div class="x">a</div>b</div>"#),
            json!("div"),
            Some(json!("x")),
        )
        .unwrap();
        assert_eq!(out.as_array().unwrap().len(), 2);
    }

    #[test]
    fn movie_parser_keeps_valid_quality_items_only() {
        let html = r#"<div class="download-list dubbled"><p class="title">Dub</p><ul>
          <li><span>کیفیت :</span> 1080p<a href="https://x.abrtech.top/a.S01E01.mkv?v=1">دانلود</a></li>
          <li><span>کیفیت :</span> 720p<a href="/movie">other</a></li>
        </ul></div>"#;
        let out = parse_movie_page(json!(html)).unwrap();
        let groups = out.as_array().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn series_parser_sorts_seasons_and_episodes() {
        let html = r#"<div class="download-season">
          <div class="download-list hardsub"><p class="title">Sub</p><ul>
          <li><span>کیفیت :</span> 1080p<div class="d-flex">قسمت 2
            <a href="https://x.abrtech.top/a.S01E02.mkv?v=1">دانلود</a></div></li>
          </ul></div>
          <button data-bs-target='#season-dlbox1'>فصل اول</button>
        </div>"#;
        let out = parse_series_page(json!(html)).unwrap();
        assert_eq!(out.as_array().unwrap().len(), 1);
        assert_eq!(out[0]["groups"][0]["episodes"][0]["number"], 2);
    }
}
