mod commands;
mod state;

// Importa os comandos do módulo database
use commands::database::{
    execute_raw_query, get_db_relationships, get_table_data, get_table_data_paginated,
    get_table_structure, get_tables, update_table_cell,
};

// Importa os comandos do módulo connection
use commands::connection::{connect_db, get_databases, switch_database};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("LIB.RS EXECUTADO");
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            execute_raw_query,
            get_tables,
            get_table_data,
            get_table_data_paginated,
            get_table_structure,
            get_db_relationships,
            update_table_cell,
            connect_db,
            get_databases,
            switch_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
