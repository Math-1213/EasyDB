#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use commands::{connection, database};
use state::AppState;

fn main() {
    println!("MAIN.RS EXECUTADO");
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Comandos de Conexão
            connection::connect_db,
            connection::get_databases,
            connection::switch_database,
            // Comandos do Banco de Dados
            database::get_tables,
            database::get_table_data,
            database::get_table_data_paginated,
            database::get_table_structure,
            database::execute_raw_query,
            database::get_db_relationships,
            database::update_table_cell,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação tauri");
}
