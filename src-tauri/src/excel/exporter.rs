use std::path::Path;

use rust_xlsxwriter::{Format, Formula, Workbook};

use crate::engine::models::WbsNode;

const CURRENCY_FORMAT: &str = "_(* #,##0.00_);_(* (#,##0.00);_(* \"-\"??_);_(@_)";

pub fn export_workbook(
    path: &Path,
    ordered: &[(WbsNode, usize)],
) -> Result<u32, String> {
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();

    sheet
        .set_name("RAB")
        .map_err(|error| error.to_string())?;

    let currency_fmt = Format::new()
        .set_num_format(CURRENCY_FORMAT)
        .set_font_name("Liberation Sans")
        .set_font_size(10);

    sheet
        .set_column_width(0, 56.0)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(1, 12.0)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(2, 18.0)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(3, 20.0)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(4, 10.0)
        .map_err(|error| error.to_string())?;

    sheet
        .write_string(0, 0, "CONSTRUCSEE — REKAPITULASI ANGGARAN BIAYA")
        .map_err(|error| error.to_string())?;
    sheet
        .write_string(2, 0, "URAIAN PEKERJAAN")
        .map_err(|error| error.to_string())?;
    sheet
        .write_string(2, 1, "VOLUME")
        .map_err(|error| error.to_string())?;
    sheet
        .write_string(2, 2, "HARGA SATUAN")
        .map_err(|error| error.to_string())?;
    sheet
        .write_string(2, 3, "TOTAL BIAYA")
        .map_err(|error| error.to_string())?;
    sheet
        .write_string(2, 4, "SATUAN")
        .map_err(|error| error.to_string())?;

    for (index, (node, depth)) in ordered.iter().enumerate() {
        let row = index as u32 + 3;
        let excel_row = row + 1;
        let indent = "  ".repeat(*depth);
        let label = if node.code.is_empty() {
            format!("{indent}{}", node.name)
        } else {
            format!("{indent}{} {}", node.code, node.name)
        };

        sheet
            .write_string_with_format(row, 0, &label, &currency_fmt)
            .map_err(|error| error.to_string())?;
        sheet
            .write_string(row, 4, &node.unit)
            .map_err(|error| error.to_string())?;

        if node.children_ids.is_empty() {
            sheet
                .write_number_with_format(row, 1, node.volume, &currency_fmt)
                .map_err(|error| error.to_string())?;
            sheet
                .write_number_with_format(row, 2, node.unit_price, &currency_fmt)
                .map_err(|error| error.to_string())?;
            let formula = format!("=B{excel_row}*C{excel_row}");
            sheet
                .write_formula_with_format(row, 3, Formula::new(formula), &currency_fmt)
                .map_err(|error| error.to_string())?;
        } else {
            let end = descendant_end(index, ordered);
            let formula = format!("=SUM(D{}:D{})", excel_row + 1, end as u32 + 4);
            sheet
                .write_formula_with_format(row, 3, Formula::new(formula), &currency_fmt)
                .map_err(|error| error.to_string())?;
        }
    }

    workbook.save(path).map_err(|error| error.to_string())?;
    Ok(ordered.len() as u32)
}

fn descendant_end(index: usize, ordered: &[(WbsNode, usize)]) -> usize {
    let base_depth = ordered[index].1;
    let mut end = index;

    for (offset, (_, depth)) in ordered.iter().enumerate().skip(index + 1) {
        if *depth <= base_depth {
            break;
        }
        end = offset;
    }

    end
}
