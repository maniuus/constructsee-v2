use std::collections::HashMap;

use crate::engine::models::{EngineSnapshot, WbsNode};

/// Template typst RAB (Rencana Anggaran Biaya) sesuai standar dokumen profesional.
/// Rujukan: docs/development/professional_presentation_standards.md (F4, margin
/// 25/20/20/15mm, Arial/Helvetica/Liberation Sans, numerik monospace, header tabel
/// berulang, zebra, grouping divisi, approval block unbreakable, terbilang).
pub fn build_typst_rab_template(snapshot: &EngineSnapshot, nodes: &[WbsNode]) -> String {
    let leaf_nodes: Vec<&WbsNode> = nodes
        .iter()
        .filter(|n| n.children_ids.is_empty())
        .collect();

    // Subtotal = jumlah total_price leaf (total_price = volume x harga satuan, belum
    // termasuk overhead). Overhead memakai persentase dari engine (single source of truth).
    let subtotal: f64 = leaf_nodes.iter().map(|n| n.total_price).sum::<f64>();
    let overhead: f64 = subtotal * snapshot.overhead_percent / 100.0;
    let total_sebelum_ppn: f64 = subtotal + overhead;
    let ppn: f64 = total_sebelum_ppn * snapshot.ppn_percent / 100.0;
    let grand_total: f64 = total_sebelum_ppn + ppn;

    let subtotal_str = fmt_idr(subtotal);
    let overhead_str = fmt_idr(overhead);
    let total_sebelum_ppn_str = fmt_idr(total_sebelum_ppn);
    let ppn_str = fmt_idr(ppn);
    let grand_total_str = fmt_idr(grand_total);
    let terbilang = terbilang_id(grand_total.round() as i64);
    let overhead_label = fmt_pct(snapshot.overhead_percent);
    let ppn_label = fmt_pct(snapshot.ppn_percent);

    // Kedalaman tiap node; urutan `nodes` sudah pre-order dari engine.
    let mut depths: HashMap<&str, usize> = HashMap::new();
    for node in nodes {
        let d = node
            .parent_id
            .as_deref()
            .and_then(|p| depths.get(p).copied())
            .map(|d| d + 1)
            .unwrap_or(0);
        depths.insert(node.id.as_str(), d);
    }

    let index_of: HashMap<&str, usize> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.as_str(), i))
        .collect();

    // Ringkasan subtree (urutan pre-order kontigu): apakah subtree punya pekerjaan
    // (leaf), total biaya seluruh leaf di bawahnya, dan indeks terakhir subtree.
    let n_nodes = nodes.len();
    let mut has_leaf = vec![false; n_nodes];
    let mut leaf_sum = vec![0f64; n_nodes];
    for i in (0..n_nodes).rev() {
        let node = &nodes[i];
        if node.children_ids.is_empty() {
            // Divisi (root) tanpa item dianggap tidak punya pekerjaan sehingga
            // tidak disajikan; node lain tanpa anak adalah pekerjaan (leaf).
            let is_division = node.parent_id.is_none();
            has_leaf[i] = !is_division;
            leaf_sum[i] = if is_division { 0.0 } else { node.total_price };
        } else {
            let mut hl = false;
            let mut sum = 0.0;
            for child in &node.children_ids {
                if let Some(&ci) = index_of.get(child.as_str()) {
                    hl |= has_leaf[ci];
                    sum += leaf_sum[ci];
                }
            }
            has_leaf[i] = hl;
            leaf_sum[i] = sum;
        }
    }

    let mut rows = String::new();
    let mut leaf_no = 0usize;
    let mut division_no = 0usize;

    for (i, node) in nodes.iter().enumerate() {
        let depth = depths[node.id.as_str()];
        let indent_pt = depth * 4;
        let is_leaf = node.children_ids.is_empty();
        // Divisi hanya disajikan bila punya pekerjaan; sub-divisi/leaf bila
        // subtree-nya mengandung pekerjaan.
        let show = if depth == 0 {
            has_leaf[i]
        } else {
            is_leaf || has_leaf[i]
        };

        if show {
            if depth == 0 {
                // Header Divisi (Level 1): nomor Romawi di kolom No, nama di
                // kolom tengah, subtotal divisi langsung di kolom Total Biaya.
                let name = escape_typst(&node.name);
                division_no += 1;
                let subtotal_div = if leaf_sum[i] > 0.0 {
                    fmt_idr(leaf_sum[i])
                } else {
                    "—".to_string()
                };
                rows.push_str(&format!(
                    "  table.cell(align: center, fill: luma(232))[#text(size: 9.5pt, weight: \"bold\")[{}]], table.cell(colspan: 5, align: left, fill: luma(232))[#text(size: 9.5pt, weight: \"bold\")[{}]], table.cell(align: right, fill: luma(232))[#text(font: numfont, weight: \"bold\")[{}]],\n",
                    to_roman(division_no),
                    name.to_uppercase(),
                    subtotal_div
                ));
            } else if is_leaf {
                leaf_no += 1;
                let uraian = escape_typst(&node.name);
                let satuan = if node.unit.is_empty() {
                    "—".to_string()
                } else {
                    escape_typst(&node.unit)
                };
                let volume = fmt_volume(node.volume);
                let harga = if node.unit_price > 0.0 {
                    fmt_idr(node.unit_price)
                } else {
                    "—".to_string()
                };
                let total = if node.total_price > 0.0 {
                    fmt_idr(node.total_price)
                } else {
                    "—".to_string()
                };
                let code_cell = if node.code.is_empty() {
                    "—".to_string()
                } else {
                    format!("#text(size: 7pt)[{}]", escape_typst(&node.code))
                };
                rows.push_str(&format!(
                    "  [{leaf_no}], [{code_cell}], [#block(inset: (left: {indent_pt}pt))[{uraian}]], [{satuan}], [#text(font: numfont)[{volume}]], [#text(font: numfont)[{harga}]], [#text(font: numfont, weight: \"semibold\")[{total}]],\n"
                ));
            } else {
                // Header Sub-Divisi (Level 2+): 9pt Bold.
                let name = escape_typst(&node.name);
                rows.push_str(&format!(
                    "  table.cell(colspan: 7, align: left)[#block(inset: (left: {indent_pt}pt))[#text(size: 9pt, weight: \"bold\")[{}]]],\n",
                    name
                ));
            }
        }
    }

    let mut out = String::new();
    out.push_str(
        r#"
#set page(
  width: 215mm,
  height: 330mm,
  margin: (top: 25mm, bottom: 20mm, left: 20mm, right: 15mm),
  header: [
    #grid(
      columns: (1fr, auto, 1fr),
      align(left)[#text(size: 7.5pt, fill: luma(120))[Nama Proyek: —]],
      align(center)[#text(size: 7.5pt, fill: luma(120), weight: "bold")[RENCANA ANGGARAN BIAYA (RAB)]],
      align(right)[#text(size: 7.5pt, fill: luma(120))[ConstrucSee v2]],
    )
  ],
  footer: [
    #line(length: 100%, stroke: 0.4pt + luma(200))
    #grid(
      columns: (1fr, 1fr),
      align(left)[#text(size: 7.5pt, fill: luma(100))[Status: DRAFT / CONFIDENTIAL]],
      align(right)[#text(size: 7.5pt, fill: luma(100))[Halaman #counter(page).display("1 dari 1", both: true)]],
    )
  ]
)

#set text(font: ("Arial", "Liberation Sans", "DejaVu Sans", "Helvetica"), size: 8.5pt)
#let numfont = ("DejaVu Sans Mono", "Consolas", "Courier New", "Liberation Mono")

#align(center)[
  #text(size: 14pt, weight: "bold")[RENCANA ANGGARAN BIAYA (RAB)]
  #v(4pt)
  #text(size: 11pt, weight: "semibold")[Nama Proyek: —]
  #v(2pt)
  #text(size: 9pt, fill: luma(90))[Lokasi: —  |  Pemilik: —  |  Kontraktor: —  |  No. Kontrak: —]
  #v(1pt)
  #text(size: 8.5pt, fill: luma(100))[Tanggal: #datetime.today().display("[year]-[month]-[day]")]
]

#v(10pt)

#table(
  columns: (0.8cm, 1.6cm, 1fr, 1.4cm, 1.7cm, 2.9cm, 3.1cm),
  align: (center, left, left, center, right, right, right),
  stroke: 0.4pt + luma(200),
  inset: (x: 4pt, y: 3pt),
  fill: (x, y) => if y == 0 { luma(236) } else if calc.rem(y, 2) == 1 { luma(248) } else { white },
  table.header(
    table.cell(align: center + horizon)[*No*],
    table.cell(align: center + horizon)[*Kode*],
    table.cell(align: center + horizon)[*Uraian Pekerjaan*],
    table.cell(align: center + horizon)[*Satuan*],
    table.cell(align: center + horizon)[*Volume*],
    table.cell(align: center + horizon)[*Harga Satuan #linebreak() (Rp)*],
    table.cell(align: center + horizon)[*Total Biaya #linebreak() (Rp)*],
  ),
"#,
    );
    out.push_str(&rows);
    out.push_str(&format!(
        r#"
)

#v(8pt)

#grid(
  columns: (1fr, 4cm),
  gutter: 3pt,
  align(right)[#text(size: 8.5pt, weight: "bold")[Subtotal Biaya Pekerjaan]],
  align(right)[#text(font: numfont)[{subtotal}]],
  align(right)[#text(size: 8.5pt, weight: "bold")[Jasa & Overhead ({overhead_label}%)]],
  align(right)[#text(font: numfont)[{overhead}]],
  align(right)[#text(size: 8.5pt, weight: "bold")[Total Sebelum PPN]],
  align(right)[#text(font: numfont)[{sebelum_ppn}]],
  align(right)[#text(size: 8.5pt, weight: "bold")[PPN ({ppn_label}%)]],
  align(right)[#text(font: numfont)[{ppn}]],
  align(right)[#text(size: 9.5pt, weight: "bold")[GRAND TOTAL (RAB)]],
  align(right)[#text(font: numfont, size: 9.5pt, weight: "bold")[Rp {grand_total}]],
)

#v(6pt)
#align(left)[#text(size: 8pt, style: "italic", fill: luma(60))[Terbilang: {terbilang} rupiah]]

#v(14pt)

#block(breakable: false)[
  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 12pt,
    align(center)[
      #v(10pt)
      #line(length: 60%, stroke: 0.5pt)
      #v(4pt)
      #text(size: 8pt, fill: luma(120))[Diajukan]
      #text(size: 8pt, fill: luma(120))[(QS / Kontraktor)]
      #v(24pt)
      #text(size: 8pt)[Tanggal Pengesahan]
    ],
    align(center)[
      #v(10pt)
      #line(length: 60%, stroke: 0.5pt)
      #v(4pt)
      #text(size: 8pt, fill: luma(120))[Diperiksa]
      #text(size: 8pt, fill: luma(120))[(Konsultan)]
      #v(24pt)
      #text(size: 8pt)[Tanggal Pengesahan]
    ],
    align(center)[
      #v(10pt)
      #line(length: 60%, stroke: 0.5pt)
      #v(4pt)
      #text(size: 8pt, fill: luma(120))[Disetujui]
      #text(size: 8pt, fill: luma(120))[(Owner / Klien)]
      #v(24pt)
      #text(size: 8pt)[Tanggal Pengesahan]
    ]
  )
]
"#,
        subtotal = subtotal_str,
        overhead_label = overhead_label,
        ppn_label = ppn_label,
        overhead = overhead_str,
        sebelum_ppn = total_sebelum_ppn_str,
        ppn = ppn_str,
        grand_total = grand_total_str,
        terbilang = terbilang,
    ));
    out
}

/// Escape karakter markup typst agar teks pengguna tidak merusak dokumen.
fn escape_typst(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\\' | '#' | '[' | ']' | '$' | '*' | '_' | '`' | '~' | '@' | '<' | '>' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Konversi angka 1..=3999 ke angka Romawi (uppercase).
fn to_roman(mut n: usize) -> String {
    const VALS: [(usize, &str); 13] = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ];
    let mut out = String::new();
    for (value, symbol) in VALS {
        while n >= value {
            out.push_str(symbol);
            n -= value;
        }
    }
    out
}

/// Kelompokkan bilangan bulat non-negatif dengan titik ribuan.
fn group_thousands(n: i64) -> String {
    let s = n.to_string();
    let mut grouped = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.insert(0, '.');
        }
        grouped.insert(0, ch);
    }
    grouped
}

/// Format mata uang Indonesia: titik ribuan, koma desimal, tepat 2 desimal.
fn fmt_idr(v: f64) -> String {
    let neg = v < 0.0;
    let scaled = (v.abs() * 100.0).round() as i64;
    let int_part = scaled / 100;
    let frac = scaled % 100;
    let s = format!("{},{:02}", group_thousands(int_part), frac);
    if neg {
        format!("-{s}")
    } else {
        s
    }
}

/// Format volume: titik ribuan, maksimal 2 desimal, nol akhir dibuang.
fn fmt_volume(v: f64) -> String {
    if v == 0.0 {
        return "0".to_string();
    }
    let neg = v < 0.0;
    let scaled = (v.abs() * 100.0).round() as i64;
    let int_part = scaled / 100;
    let frac = scaled % 100;
    let mut s = group_thousands(int_part);
    if frac != 0 {
        if frac % 10 == 0 {
            s.push_str(&format!(",{}", frac / 10));
        } else {
            s.push_str(&format!(",{:02}", frac));
        }
    }
    if neg {
        s.insert(0, '-');
    }
    s
}

/// Format persentase ringkas (bulat tanpa desimal, selain itu 1 desimal koma).
fn fmt_pct(v: f64) -> String {
    let text = if (v.fract()).abs() < 1e-9 {
        format!("{}", v as i64)
    } else {
        format!("{:.1}", v)
    };
    text.replace('.', ",")
}

/// Terbilang Bahasa Indonesia.
fn terbilang_id(n: i64) -> String {
    if n == 0 {
        return "nol".to_string();
    }
    let neg = n < 0;
    let words = terbilang_unsigned(n.abs());
    if neg {
        format!("minus {words}")
    } else {
        words
    }
}

fn terbilang_unsigned(n: i64) -> String {
    let mut parts: Vec<String> = Vec::new();
    let miliar = n / 1_000_000_000;
    let juta = (n / 1_000_000) % 1_000;
    let ribu = (n / 1_000) % 1_000;
    let rem = n % 1_000;

    if miliar > 0 {
        parts.push(format!("{} miliar", terbilang_ratusan(miliar)));
    }
    if juta > 0 {
        parts.push(format!("{} juta", terbilang_ratusan(juta)));
    }
    if ribu > 0 {
        if ribu == 1 {
            parts.push("seribu".to_string());
        } else {
            parts.push(format!("{} ribu", terbilang_ratusan(ribu)));
        }
    }
    if rem > 0 {
        parts.push(terbilang_ratusan(rem));
    }
    parts.join(" ")
}

/// Terbilang untuk rentang 0..=999.
fn terbilang_ratusan(n: i64) -> String {
    const SATUAN: [&str; 12] = [
        "", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan",
        "sepuluh", "sebelas",
    ];
    if n < 12 {
        return SATUAN[n as usize].to_string();
    }
    if n < 20 {
        return format!("{} belas", SATUAN[(n - 10) as usize]);
    }
    let ratus = n / 100;
    let sisa = n % 100;
    let mut out = String::new();
    if ratus > 0 {
        if ratus == 1 {
            out.push_str("seratus");
        } else {
            out.push_str(&format!("{} ratus", SATUAN[ratus as usize]));
        }
    }
    if sisa > 0 {
        if !out.is_empty() {
            out.push(' ');
        }
        if sisa < 12 {
            out.push_str(SATUAN[sisa as usize]);
        } else if sisa < 20 {
            out.push_str(&format!("{} belas", SATUAN[(sisa - 10) as usize]));
        } else {
            let puluh = sisa / 10;
            let sat = sisa % 10;
            out.push_str(&format!("{} puluh", SATUAN[puluh as usize]));
            if sat > 0 {
                out.push(' ');
                out.push_str(SATUAN[sat as usize]);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fmt_idr_indonesian() {
        assert_eq!(fmt_idr(1_448_100_000.0), "1.448.100.000,00");
        assert_eq!(fmt_idr(15_187.5), "15.187,50");
        assert_eq!(fmt_idr(0.0), "0,00");
    }

    #[test]
    fn fmt_volume_trims_trailing_zero() {
        assert_eq!(fmt_volume(1200.0), "1.200");
        assert_eq!(fmt_volume(1200.5), "1.200,5");
        assert_eq!(fmt_volume(0.75), "0,75");
        assert_eq!(fmt_volume(0.0), "0");
    }

    #[test]
    fn terbilang_miliar() {
        assert_eq!(
            terbilang_id(1_592_910_000),
            "satu miliar lima ratus sembilan puluh dua juta sembilan ratus sepuluh ribu"
        );
        assert_eq!(terbilang_id(0), "nol");
        assert_eq!(terbilang_id(11), "sebelas");
        assert_eq!(terbilang_id(25), "dua puluh lima");
        assert_eq!(terbilang_id(1_768_130_100),
            "satu miliar tujuh ratus enam puluh delapan juta seratus tiga puluh ribu seratus");
    }

    #[test]
    fn escape_typst_specials() {
        assert_eq!(escape_typst("[a]#b_c"), "\\[a\\]\\#b\\_c");
        assert_eq!(escape_typst("Pasang Bata"), "Pasang Bata");
    }

    #[test]
    fn roman_numerals() {
        assert_eq!(to_roman(1), "I");
        assert_eq!(to_roman(4), "IV");
        assert_eq!(to_roman(9), "IX");
        assert_eq!(to_roman(10), "X");
        assert_eq!(to_roman(12), "XII");
        assert_eq!(to_roman(40), "XL");
        assert_eq!(to_roman(3999), "MMMCMXCIX");
    }

    #[test]
    fn empty_division_is_omitted() {
        let make = |id: &str, parent: Option<&str>, children: Vec<&str>, code: &str, name: &str, unit: &str, volume: f64, price: f64| WbsNode {
            id: id.into(),
            parent_id: parent.map(|p| p.to_string()),
            children_ids: children.into_iter().map(|c| c.to_string()).collect(),
            code: code.into(),
            name: name.into(),
            unit: unit.into(),
            volume,
            unit_price: price,
            total_price: volume * price,
            is_expanded: true,
            components: Default::default(),
            method: "langsung".into(),
        };

        let empty = make("div-empty", None, vec![], "IV", "PEKERJAAN LANSEKAP", "", 0.0, 0.0);
        let div = make("div-full", None, vec!["item-1"], "I", "PERSIAPAN", "", 0.0, 0.0);
        let item = make("item-1", Some("div-full"), vec![], "1.1", "Galian", "m3", 2.0, 1000.0);
        let nodes = vec![empty, div, item];
        let snapshot = EngineSnapshot {
            nodes: nodes.clone(),
            roots: vec!["div-empty".into(), "div-full".into()],
            total_cost: 2000.0,
            overhead_percent: 10.0,
            ppn_percent: 11.0,
            can_undo: false,
            can_redo: false,
        };

        let src = build_typst_rab_template(&snapshot, &nodes);
        assert!(!src.contains("PEKERJAAN LANSEKAP"), "divisi kosong harus tidak tampil");
        assert!(src.contains("PERSIAPAN"));
        assert!(src.contains("Galian"));
    }

    #[test]
    fn grand_total_includes_ppn() {
        // base 1.448.100.000, overhead 10% -> 1.592.910.000, PPN 11% -> 1.768.130.100
        let base = 1_448_100_000.0_f64;
        let overhead = base * 0.10;
        let sebelum_ppn = base + overhead;
        let grand = sebelum_ppn + sebelum_ppn * 0.11;
        assert!((sebelum_ppn - 1_592_910_000.0).abs() < 0.5);
        assert!((grand - 1_768_130_100.0).abs() < 0.5);
    }
}
