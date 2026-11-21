//! Python bindings for `series_radar/`: generated from the signatures in `port.rs` by rust-anything.
//! Regenerate with `rust-anything refresh` after changing them.

use pyo3::prelude::*;

pub mod js;
pub mod port;
pub mod pyconv;
pub mod pynum;

#[allow(unused_imports)]
use pynum::Num;

fn error(message: String) -> PyErr {
    use pyo3::exceptions as e;
    let (kind, text) = message.split_once(": ").unwrap_or(("", message.as_str()));
    let text = text.to_string();
    match kind {
        "TypeError" => e::PyTypeError::new_err(text),
        "KeyError" => e::PyKeyError::new_err(text),
        "IndexError" => e::PyIndexError::new_err(text),
        "OverflowError" => e::PyOverflowError::new_err(text),
        "ZeroDivisionError" => e::PyZeroDivisionError::new_err(text),
        "AttributeError" => e::PyAttributeError::new_err(text),
        "RuntimeError" => e::PyRuntimeError::new_err(text),
        "NotImplementedError" => e::PyNotImplementedError::new_err(text),
        "LookupError" => e::PyLookupError::new_err(text),
        "ArithmeticError" => e::PyArithmeticError::new_err(text),
        "UnicodeError" => e::PyUnicodeError::new_err(text),
        "ValueError" => e::PyValueError::new_err(text),
        _ => e::PyValueError::new_err(message),
    }
}

fn fingerprint_inner(url: Bound<'_, PyAny>) -> Result<serde_json::Value, String> {
    let url: serde_json::Value = crate::pyconv::FromPy::from_py(&url)?;
    let out = port::fingerprint(url)?;
    Ok(out)
}

/// `fingerprint`.
#[pyfunction]
#[pyo3(name = "fingerprint", signature = (url))]
fn fingerprint(py: Python<'_>, url: Bound<'_, PyAny>) -> PyResult<Py<PyAny>> {
    fingerprint_inner(url)
        .map_err(error)
        .and_then(|v| crate::pyconv::ToPy::to_py(&v, py))
}

fn elements_inner(
    html: Bound<'_, PyAny>,
    tag: Bound<'_, PyAny>,
    class_name: Option<Bound<'_, PyAny>>,
) -> Result<serde_json::Value, String> {
    let html: serde_json::Value = crate::pyconv::FromPy::from_py(&html)?;
    let tag: serde_json::Value = crate::pyconv::FromPy::from_py(&tag)?;
    let class_name: Option<serde_json::Value> = match &class_name {
        None => None,
        Some(v) => Some(crate::pyconv::FromPy::from_py(v)?),
    };
    let out = port::elements(html, tag, class_name)?;
    Ok(out)
}

/// `elements`.
#[pyfunction]
#[pyo3(name = "elements", signature = (html, tag, class_name=None))]
fn elements(
    py: Python<'_>,
    html: Bound<'_, PyAny>,
    tag: Bound<'_, PyAny>,
    class_name: Option<Bound<'_, PyAny>>,
) -> PyResult<Py<PyAny>> {
    elements_inner(html, tag, class_name)
        .map_err(error)
        .and_then(|v| crate::pyconv::ToPy::to_py(&v, py))
}

fn parse_movie_page_inner(page_html: Bound<'_, PyAny>) -> Result<serde_json::Value, String> {
    let page_html: serde_json::Value = crate::pyconv::FromPy::from_py(&page_html)?;
    let out = port::parse_movie_page(page_html)?;
    Ok(out)
}

/// `parse_movie_page`.
#[pyfunction]
#[pyo3(name = "parse_movie_page", signature = (page_html))]
fn parse_movie_page(py: Python<'_>, page_html: Bound<'_, PyAny>) -> PyResult<Py<PyAny>> {
    parse_movie_page_inner(page_html)
        .map_err(error)
        .and_then(|v| crate::pyconv::ToPy::to_py(&v, py))
}

fn parse_series_page_inner(page_html: Bound<'_, PyAny>) -> Result<serde_json::Value, String> {
    let page_html: serde_json::Value = crate::pyconv::FromPy::from_py(&page_html)?;
    let out = port::parse_series_page(page_html)?;
    Ok(out)
}

/// `parse_series_page`.
#[pyfunction]
#[pyo3(name = "parse_series_page", signature = (page_html))]
fn parse_series_page(py: Python<'_>, page_html: Bound<'_, PyAny>) -> PyResult<Py<PyAny>> {
    parse_series_page_inner(page_html)
        .map_err(error)
        .and_then(|v| crate::pyconv::ToPy::to_py(&v, py))
}

#[pymodule]
#[pyo3(name = "_native")]
fn native_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(fingerprint, m)?)?;
    m.add_function(wrap_pyfunction!(elements, m)?)?;
    m.add_function(wrap_pyfunction!(parse_movie_page, m)?)?;
    m.add_function(wrap_pyfunction!(parse_series_page, m)?)?;
    Ok(())
}
