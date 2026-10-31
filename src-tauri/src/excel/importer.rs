use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use regex::Regex;
use uuid::Uuid;

use crate::engine::models::{WbsComponents, WbsNode, METHOD_LANGSUNG};

pub fn import_workbook(path: &Path) -> Result<(Vec<WbsNode>, Vec<String>), String> {
    let mut workbook =
        open_workbook_auto(path).map_err(|error| format!("Gagal membuka workbook: {error}"))?;

    let sheet_names = workbook.sheet_names().to_owned();
    let sheet = sheet_names
        .first()
        .cloned()
        .ok_or_else(|| "Workbook tidak memiliki sheet".to_string())?;

    let range = workbook
        .worksheet_range(&sheet)
        .map_err(|error| format!("Gagal membaca sheet {sheet}: {error}"))?;

    let division_re = Regex::new(r"^([IVXLC]+)\.?$").map_err(|error| error.to_string())?;
    let numeric_re = Regex::new(r"^(\d+(?:\.\d+)*)\.?$").map_err(|error| error.to_string())?;

    let mut nodes: Vec<WbsNode> = Vec::new();
    let mut roots: Vec<String> = Vec::new();
    let mut stack: Vec<(usize, String)> = Vec::new();
    let mut index_of: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    let mut last_code = String::new();
    let mut last_name = String::new();

    for row in range.rows() {
        let column_a = text(row.first());
        let column_b = text(row.get(1));
        let column_c = text(row.get(2));
        let number_b = number(row.get(1));
        let number_c = number(row.get(2));
        let number_d = number(row.get(3));
        let number_e = number(row.get(4));

        let combined = number_b.is_some() && number_c.is_some();
        let (mut code, mut name, unit, volume, unit_price) = if combined {
            let (code, name) = split_label(&column_a);
            (code, name, text(row.get(4)), number_b.unwrap_or(0.0), number_c.unwrap_or(0.0))
        } else {
            let (code, inferred) = split_label(&column_a);
            let name = if column_b.is_empty() { inferred } else { column_b.clone() };
            (
                code,
                name,
                column_c.clone(),
                number_d.unwrap_or(0.0),
                number_e.unwrap_or(0.0),
            )
        };

        if code.is_empty() {
            code = last_code.clone();
        }
        if name.is_empty() {
            name = last_name.clone();
        }

        if name.is_empty() {
            continue;
        }

        let upper = name.to_uppercase();
        if upper.contains("URAIAN")
            || upper.contains("KODE")
            || upper.starts_with("TOTAL")
            || upper.starts_with("JUMLAH")
            || upper.starts_with("SUB TOTAL")
        {
            continue;
        }

        let has_value = number_b.is_some()
            || number_c.is_some()
            || number_d.is_some()
            || number_e.is_some();

        if code.is_empty() && !has_value {
            continue;
        }

        if !code.is_empty() {
            last_code = code.clone();
        }
        last_name = name.clone();

        let depth = code_depth(&code, &division_re, &numeric_re)
            .unwrap_or_else(|| stack.last().map(|(depth, _)| depth + 1).unwrap_or(0));

        while stack.last().map(|(parent_depth, _)| *parent_depth >= depth).unwrap_or(false) {
            stack.pop();
        }

        let parent_id = stack.last().map(|(_, id)| id.clone());
        let id = Uuid::new_v4().to_string();
        let is_leaf = unit_price > 0.0 || (combined && number_b.is_some());
        let components = WbsComponents::from_unit_price(unit_price);
        let unit_price = components.total();

        let parent_index = parent_id
            .as_ref()
            .and_then(|parent_id| index_of.get(parent_id).copied());

        nodes.push(WbsNode {
            id: id.clone(),
            parent_id,
            children_ids: Vec::new(),
            code,
            name,
            unit,
            volume,
            unit_price,
            total_price: if is_leaf { volume * unit_price } else { 0.0 },
            is_expanded: depth == 0,
            components,
            method: METHOD_LANGSUNG.to_string(),
        });

        index_of.insert(id.clone(), nodes.len() - 1);

        if let Some(parent_index) = parent_index {
            nodes[parent_index].children_ids.push(id.clone());
        } else {
            roots.push(id.clone());
        }

        stack.push((depth, id));
    }

    Ok((nodes, roots))
}

fn split_label(raw: &str) -> (String, String) {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return (String::new(), String::new());
    }

    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let first = parts.next().unwrap_or("").trim();
    let rest = parts.next().unwrap_or("").trim();

    let first_char = first.chars().next();
    let starts_numeric = first_char
        .map(|character| character.is_ascii_digit())
        .unwrap_or(false);
    let alpha_dotted = first_char
        .map(|character| character.is_ascii_uppercase())
        .unwrap_or(false)
        && first.contains('.')
        && !rest.is_empty();
    let roman_like = first.len() <= 5
        && !first.is_empty()
        && first
            .chars()
            .all(|character| matches!(character, 'I' | 'V' | 'X' | 'L' | 'C'));

    if starts_numeric || alpha_dotted || roman_like {
        (first.trim_end_matches('.').to_string(), rest.to_string())
    } else {
        (String::new(), trimmed.to_string())
    }
}

fn code_depth(code: &str, division_re: &Regex, numeric_re: &Regex) -> Option<usize> {
    if code.is_empty() {
        return None;
    }
    if division_re.is_match(code) {
        return Some(0);
    }
    numeric_re.captures(code).map(|captures| {
        captures
            .get(1)
            .map(|value| value.as_str().matches('.').count())
            .unwrap_or(0)
    })
}

fn text(cell: Option<&Data>) -> String {
    match cell {
        Some(Data::String(value)) => value.trim().to_string(),
        Some(Data::Float(value)) => format_number(*value),
        Some(Data::Int(value)) => value.to_string(),
        Some(Data::Bool(value)) => value.to_string(),
        Some(Data::DateTimeIso(value)) => value.clone(),
        _ => String::new(),
    }
}

fn number(cell: Option<&Data>) -> Option<f64> {
    match cell {
        Some(Data::Float(value)) => Some(*value),
        Some(Data::Int(value)) => Some(*value as f64),
        Some(Data::String(value)) => parse_number(value),
        Some(Data::DurationIso(value)) => value.parse().ok(),
        _ => None,
    }
}

fn parse_number(raw: &str) -> Option<f64> {
    let normalized = raw.trim().replace('.', "").replace(',', ".");
    normalized.parse().ok()
}

fn format_number(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}
