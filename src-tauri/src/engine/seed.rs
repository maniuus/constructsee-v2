use std::collections::HashMap;

use super::{
    calc,
    models::{WbsComponents, WbsNode, METHOD_LANGSUNG},
};

type SeedItem = (&'static str, &'static str, &'static str, f64, f64);
type SeedDivision = (&'static str, &'static str, &'static str, Vec<SeedItem>);

pub fn sample() -> (Vec<WbsNode>, Vec<String>) {
    let divisions: Vec<SeedDivision> = vec![
        (
            "div-1",
            "I",
            "PERSIAPAN LAPANGAN/SITE WORK",
            vec![
                ("1.1", "Pembersihan Lahan & Pengukuran", "m2", 1200.0, 25_000.0),
                ("1.2", "Direksi Keet & Mobilisasi", "ls", 1.0, 18_500_000.0),
            ],
        ),
        (
            "div-2",
            "II",
            "PEKERJAAN STRUKTUR",
            vec![
                ("2.1", "Galian Tanah Pondasi", "m3", 420.0, 95_000.0),
                ("2.2", "Beton Struktur K-225", "m3", 260.0, 1_450_000.0),
                ("2.3", "Pembesian & Bekisting", "kg", 18_500.0, 16_500.0),
            ],
        ),
        (
            "div-3",
            "III",
            "PEKERJAAN ARSITEKTUR",
            vec![
                ("3.1", "Pasangan Dinding Bata Ringan", "m2", 1_450.0, 185_000.0),
                ("3.2", "Plesteran & Acian", "m2", 2_900.0, 68_000.0),
            ],
        ),
        ("div-4", "IV", "PEKERJAAN LANSEKAP", vec![]),
        (
            "div-5",
            "V",
            "PEKERJAAN MEKANIKAL DAN ELEKTRIKAL",
            vec![
                ("5.1", "Instalasi Listrik & Penerangan", "ls", 1.0, 125_000_000.0),
                ("5.2", "Instalasi Plumbing & Sanitair", "ls", 1.0, 87_000_000.0),
            ],
        ),
        ("div-6", "VI", "PEKERJAAN PLAMBING", vec![]),
        ("div-7", "VII", "JALAN PADA PERMUKIMAN", vec![]),
        ("div-8", "VIII", "DRAINASE JALAN", vec![]),
        ("div-9", "IX", "JARINGAN PIPA DI LUAR GEDUNG", vec![]),
        ("div-10", "X", "SISTEM STRUKTUR RISHA", vec![]),
    ];

    let mut nodes = Vec::new();
    let mut roots = Vec::new();

    for (division_id, division_code, division_name, items) in divisions {
        roots.push(division_id.to_string());
        nodes.push(WbsNode {
            id: division_id.to_string(),
            parent_id: None,
            children_ids: items
                .iter()
                .map(|(code, _, _, _, _)| format!("item-{code}"))
                .collect(),
            code: division_code.to_string(),
            name: division_name.to_string(),
            unit: String::new(),
            volume: 0.0,
            unit_price: 0.0,
            total_price: 0.0,
            is_expanded: true,
            components: WbsComponents::default(),
            method: METHOD_LANGSUNG.to_string(),
        });

        for (code, name, unit, volume, unit_price) in items {
            let components = WbsComponents::from_unit_price(unit_price);
            let unit_price = components.total();
            nodes.push(WbsNode {
                id: format!("item-{code}"),
                parent_id: Some(division_id.to_string()),
                children_ids: Vec::new(),
                code: code.to_string(),
                name: name.to_string(),
                unit: unit.to_string(),
                volume,
                unit_price,
                total_price: volume * unit_price,
                is_expanded: false,
                components,
                method: METHOD_LANGSUNG.to_string(),
            });
        }
    }

    let mut map: HashMap<String, WbsNode> =
        nodes.into_iter().map(|node| (node.id.clone(), node)).collect();
    calc::rollup_all(&mut map);

    (map.into_values().collect(), roots)
}
