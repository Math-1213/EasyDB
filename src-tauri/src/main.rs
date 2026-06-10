#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

// Estado global para armazenar a string de conexão ativa
#[derive(Default)]
struct AppState {
    connection_string: Mutex<Option<String>>,
}

#[derive(Deserialize)]
struct DbConfig {
    host: String,
    port: String,
    user: String,
    password: Option<String>,
    database: String,
}

// Estrutura para retornar dados da tabela dinamicamente para o React
#[derive(Serialize)]
struct TableData {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

// Função auxiliar para criar o conector TLS
fn get_tls_connector() -> Result<MakeTlsConnector, String> {
    let na_tls = TlsConnector::new().map_err(|e| format!("Falha TLS: {}", e))?;
    Ok(MakeTlsConnector::new(na_tls))
}

#[tauri::command]
async fn connect_db(config: DbConfig, state: State<'_, AppState>) -> Result<String, String> {
    let pass = config.password.unwrap_or_default();
    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        config.host, config.port, config.user, pass, config.database
    );

    let connector = get_tls_connector()?;

    match tokio_postgres::connect(&conn_str, connector).await {
        Ok((client, connection)) => {
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Erro na conexão: {}", e);
                }
            });

            match client.execute("SELECT 1", &[]).await {
                Ok(_) => {
                    // Salva a string de conexão no estado global se o teste passar
                    let mut conn_guard = state.connection_string.lock().unwrap();
                    *conn_guard = Some(conn_str);
                    Ok("Conectado com sucesso!".to_string())
                }
                Err(e) => Err(format!("Falha na query de teste: {}", e)),
            }
        }
        Err(e) => Err(format!("Erro ao conectar: {}", e)),
    }
}

// Comando para listar todas as tabelas públicas do banco de dados
#[tauri::command]
async fn get_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn_str = state
        .connection_string
        .lock()
        .unwrap()
        .clone()
        .ok_or("Não há nenhuma conexão ativa")?;

    let connector = get_tls_connector()?;
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    // Query padrão do Postgres para listar tabelas criadas pelo usuário
    let rows = client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        &[],
    ).await.map_err(|e| e.to_string())?;

    let tables = rows.iter().map(|row| row.get::<_, String>(0)).collect();
    Ok(tables)
}

// Comando para buscar os dados de uma tabela específica de forma dinâmica
#[tauri::command]
async fn get_table_data(
    table_name: String,
    state: State<'_, AppState>,
) -> Result<TableData, String> {
    let conn_str = state
        .connection_string
        .lock()
        .unwrap()
        .clone()
        .ok_or("Não há nenhuma conexão ativa")?;

    let connector = get_tls_connector()?;
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    // 1. Previne injeção básica garantindo que o nome da tabela só contém caracteres válidos
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Nome de tabela inválido".to_string());
    }

    // 2. Busca os dados (Limitado a 100 linhas por segurança no MVP)
    let query = format!("SELECT * FROM {} LIMIT 100", table_name);
    let rows = client.query(&query, &[]).await.map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok(TableData {
            columns: vec![],
            rows: vec![],
        });
    }

    // 3. Extrai o nome das colunas dinamicamente
    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|col| col.name().to_string())
        .collect();

    // 4. Converte todos os valores de todas as células para String para facilitar o envio via JSON
    // 4. Converte os valores tratando os tipos dinamicamente
    let mut grid_rows = Vec::new();
    for row in rows {
        let mut current_row = Vec::new();
        for i in 0..columns.len() {
            // Pega o tipo da coluna atual para saber como extrair o dado
            let column_type = row.columns()[i].type_().name();

            let value: String = match column_type {
                "int4" | "serial" => {
                    let val: Option<i32> = row.try_get(i).unwrap_or(None);
                    val.map(|v| v.to_string())
                        .unwrap_or_else(|| "NULL".to_string())
                }
                "int8" | "bigserial" => {
                    let val: Option<i64> = row.try_get(i).unwrap_or(None);
                    val.map(|v| v.to_string())
                        .unwrap_or_else(|| "NULL".to_string())
                }
                "float4" => {
                    let val: Option<f32> = row.try_get(i).unwrap_or(None);
                    val.map(|v| v.to_string())
                        .unwrap_or_else(|| "NULL".to_string())
                }
                "float8" | "numeric" => {
                    let val: Option<f64> = row.try_get(i).unwrap_or(None);
                    val.map(|v| v.to_string())
                        .unwrap_or_else(|| "NULL".to_string())
                }
                "bool" => {
                    let val: Option<bool> = row.try_get(i).unwrap_or(None);
                    val.map(|v| v.to_string())
                        .unwrap_or_else(|| "NULL".to_string())
                }
                "varchar" | "text" | "bpchar" => {
                    let val: Option<String> = row.try_get(i).unwrap_or(None);
                    val.unwrap_or_else(|| "NULL".to_string())
                }
                // Fallback caso encontre um tipo que ainda não mapeamos (como timestamp, jsonb, etc)
                _ => {
                    // Tenta ler como string pura, se falhar joga o marcador do tipo
                    let val: Result<String, _> = row.try_get(i);
                    match val {
                        Ok(s) => s,
                        Err(_) => format!("[{}]", column_type),
                    }
                }
            };
            current_row.push(value);
        }
        grid_rows.push(current_row);
    }

    Ok(TableData {
        columns,
        rows: grid_rows,
    })
}

#[derive(Serialize)]
struct ColumnStructure {
    name: String,
    data_type: String,
    is_nullable: String,
    column_default: Option<String>,
    is_primary: bool,
    is_foreign: bool,
}

#[tauri::command]
async fn get_table_structure(
    table_name: String,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnStructure>, String> {
    let conn_str = state
        .connection_string
        .lock()
        .unwrap()
        .clone()
        .ok_or("Não há nenhuma conexão ativa")?;

    let connector = get_tls_connector()?;
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Nome de tabela inválido".to_string());
    }

    // Query para buscar a estrutura básica combinando com as restrições de PK e FK
    let query = "
        SELECT 
            c.column_name, 
            c.data_type, 
            c.is_nullable, 
            c.column_default,
            EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
            ) as is_primary,
            EXISTS (
                SELECT 1 FROM information_schema.table_constraints tc 
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
            ) as is_foreign
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = $1
        ORDER BY c.ordinal_position;
    ";

    let rows = client
        .query(query, &[&table_name])
        .await
        .map_err(|e| e.to_string())?;

    let mut structure = Vec::new();
    for row in rows {
        structure.push(ColumnStructure {
            name: row.get(0),
            data_type: row.get(1),
            is_nullable: row.get(2),
            column_default: row.get(3),
            is_primary: row.get(4),
            is_foreign: row.get(5),
        });
    }

    Ok(structure)
}

#[derive(Serialize)]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    affected_rows: u64,
    message: String,
}

#[tauri::command]
async fn execute_raw_query(sql: String, state: State<'_, AppState>) -> Result<QueryResult, String> {
    let conn_str = state
        .connection_string
        .lock()
        .unwrap()
        .clone()
        .ok_or("Não há nenhuma conexão ativa")?;

    let connector = get_tls_connector()?;
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    // Executa a query
    let rows = client.query(&sql, &[]).await;

    match rows {
        Ok(pg_rows) => {
            if pg_rows.is_empty() {
                // Pode ser um comando que não retorna linhas (UPDATE/INSERT) ou um SELECT vazio
                return Ok(QueryResult {
                    columns: Vec::new(),
                    rows: Vec::new(),
                    affected_rows: 0,
                    message: "Comando executado com sucesso (Nenhum registro retornado)."
                        .to_string(),
                });
            }

            // Descobre as colunas dinamicamente
            let columns: Vec<String> = pg_rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();

            // Mapeia e converte as linhas usando o motor de tipos que criamos antes
            let mut grid_rows = Vec::new();
            for row in pg_rows {
                let mut current_row = Vec::new();
                for i in 0..columns.len() {
                    let column_type = row.columns()[i].type_().name();
                    let value: String = match column_type {
                        "int4" | "serial" => {
                            let val: Option<i32> = row.try_get(i).unwrap_or(None);
                            val.map(|v| v.to_string())
                                .unwrap_or_else(|| "NULL".to_string())
                        }
                        "int8" | "bigserial" => {
                            let val: Option<i64> = row.try_get(i).unwrap_or(None);
                            val.map(|v| v.to_string())
                                .unwrap_or_else(|| "NULL".to_string())
                        }
                        "float4" => {
                            let val: Option<f32> = row.try_get(i).unwrap_or(None);
                            val.map(|v| v.to_string())
                                .unwrap_or_else(|| "NULL".to_string())
                        }
                        "float8" | "numeric" => {
                            let val: Option<f64> = row.try_get(i).unwrap_or(None);
                            val.map(|v| v.to_string())
                                .unwrap_or_else(|| "NULL".to_string())
                        }
                        "bool" => {
                            let val: Option<bool> = row.try_get(i).unwrap_or(None);
                            val.map(|v| v.to_string())
                                .unwrap_or_else(|| "NULL".to_string())
                        }
                        "varchar" | "text" | "bpchar" => {
                            let val: Option<String> = row.try_get(i).unwrap_or(None);
                            val.unwrap_or_else(|| "NULL".to_string())
                        }
                        _ => {
                            let val: Result<String, _> = row.try_get(i);
                            match val {
                                Ok(s) => s,
                                Err(_) => format!("[{}]", column_type),
                            }
                        }
                    };
                    current_row.push(value);
                }
                grid_rows.push(current_row);
            }

            let total_rows = grid_rows.len();

            Ok(QueryResult {
                columns,
                rows: grid_rows,
                affected_rows: 0,
                message: format!("{} linhas recuperadas.", total_rows),
            })
        }
        Err(e) => {
            // Se falhou, pode ser que seja um comando do tipo INSERT/UPDATE/DELETE que não retorna linhas no client.query
            // Vamos tentar rodar como execute para pegar as linhas afetadas antes de dar erro definitivo
            let affected = client.execute(&sql, &[]).await;
            match affected {
                Ok(count) => Ok(QueryResult {
                    columns: Vec::new(),
                    rows: Vec::new(),
                    affected_rows: count,
                    message: format!("Sucesso. Linhas afetadas: {}", count),
                }),
                Err(_) => Err(e.to_string()), // Retorna o erro SQL original caso falhe também
            }
        }
    }
}

#[derive(Serialize)]
struct Relationship {
    origin_table: String,
    origin_column: String,
    target_table: String,
    target_column: String,
}

#[tauri::command]
async fn get_db_relationships(state: State<'_, AppState>) -> Result<Vec<Relationship>, String> {
    let conn_str = state
        .connection_string
        .lock()
        .unwrap()
        .clone()
        .ok_or("Não há nenhuma conexão ativa")?;

    let connector = get_tls_connector()?;
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    // Query que descobre as tabelas de origem, colunas, tabelas de destino e colunas de destino
    let query = "
        SELECT
            tc.table_name AS origin_table,
            kcu.column_name AS origin_column,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    ";

    let rows = client.query(query, &[]).await.map_err(|e| e.to_string())?;

    let mut relationships = Vec::new();
    for row in rows {
        relationships.push(Relationship {
            origin_table: row.get(0),
            origin_column: row.get(1),
            target_table: row.get(2),
            target_column: row.get(3),
        });
    }

    Ok(relationships)
}
fn main() {
    tauri::Builder::default()
        .manage(AppState::default()) // Registra o estado global aqui
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connect_db,
            get_tables,
            get_table_data,
            get_table_structure,
            execute_raw_query,
            get_db_relationships,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação tauri");
}
