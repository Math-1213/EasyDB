use crate::state::{get_tls_connector, AppState};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct TableData {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

#[derive(Serialize)]
pub struct ColumnStructure {
    name: String,
    data_type: String,
    is_nullable: String,
    column_default: Option<String>,
    is_primary: bool,
    is_foreign: bool,
}

#[derive(Serialize)]
pub struct QueryResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    affected_rows: u64,
    message: String,
}

#[derive(Serialize)]
pub struct Relationship {
    origin_table: String,
    origin_column: String,
    target_table: String,
    target_column: String,
}

#[tauri::command]
pub async fn get_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
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

    let rows = client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
        &[],
    ).await.map_err(|e| e.to_string())?;

    Ok(rows.iter().map(|row| row.get::<_, String>(0)).collect())
}

#[tauri::command]
pub async fn get_table_data(
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

    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Nome de tabela inválido".to_string());
    }

    let query = format!("SELECT * FROM {} LIMIT 100", table_name);
    let rows = client.query(&query, &[]).await.map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok(TableData {
            columns: vec![],
            rows: vec![],
        });
    }

    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|col| col.name().to_string())
        .collect();
    let mut grid_rows = Vec::new();

    for row in rows {
        let mut current_row = Vec::new();
        for i in 0..columns.len() {
            let column_type = row.columns()[i].type_().name();
            let value: String = match column_type {
                "int4" | "serial" => row
                    .try_get::<_, Option<i32>>(i)
                    .unwrap_or(None)
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "NULL".to_string()),
                "int8" | "bigserial" => row
                    .try_get::<_, Option<i64>>(i)
                    .unwrap_or(None)
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "NULL".to_string()),
                "float4" => row
                    .try_get::<_, Option<f32>>(i)
                    .unwrap_or(None)
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "NULL".to_string()),
                "float8" | "numeric" => row
                    .try_get::<_, Option<f64>>(i)
                    .unwrap_or(None)
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "NULL".to_string()),
                "bool" => row
                    .try_get::<_, Option<bool>>(i)
                    .unwrap_or(None)
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "NULL".to_string()),
                "varchar" | "text" | "bpchar" => row
                    .try_get::<_, Option<String>>(i)
                    .unwrap_or(None)
                    .unwrap_or_else(|| "NULL".to_string()),
                _ => row
                    .try_get::<_, String>(i)
                    .unwrap_or_else(|_| format!("[{}]", column_type)),
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

#[tauri::command]
pub async fn get_table_structure(
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

    let query = "
        SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
        EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY') as is_primary,
        EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY') as is_foreign
        FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position;
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

#[tauri::command]
pub async fn execute_raw_query(
    sql: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, String> {
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

    match client.query(&sql, &[]).await {
        Ok(pg_rows) => {
            if pg_rows.is_empty() {
                return Ok(QueryResult {
                    columns: Vec::new(),
                    rows: Vec::new(),
                    affected_rows: 0,
                    message: "Comando executado com sucesso (Nenhum registro retornado)."
                        .to_string(),
                });
            }
            let columns: Vec<String> = pg_rows[0]
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect();
            let mut grid_rows = Vec::new();
            for row in pg_rows {
                let mut current_row = Vec::new();
                for i in 0..columns.len() {
                    let column_type = row.columns()[i].type_().name();
                    let value: String = match column_type {
                        "int4" | "serial" => row
                            .try_get::<_, Option<i32>>(i)
                            .unwrap_or(None)
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "NULL".to_string()),
                        "int8" | "bigserial" => row
                            .try_get::<_, Option<i64>>(i)
                            .unwrap_or(None)
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "NULL".to_string()),
                        "float4" => row
                            .try_get::<_, Option<f32>>(i)
                            .unwrap_or(None)
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "NULL".to_string()),
                        "float8" | "numeric" => row
                            .try_get::<_, Option<f64>>(i)
                            .unwrap_or(None)
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "NULL".to_string()),
                        "bool" => row
                            .try_get::<_, Option<bool>>(i)
                            .unwrap_or(None)
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| "NULL".to_string()),
                        "varchar" | "text" | "bpchar" => row
                            .try_get::<_, Option<String>>(i)
                            .unwrap_or(None)
                            .unwrap_or_else(|| "NULL".to_string()),
                        _ => row
                            .try_get::<_, String>(i)
                            .unwrap_or_else(|_| format!("[{}]", column_type)),
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
        Err(e) => match client.execute(&sql, &[]).await {
            Ok(count) => Ok(QueryResult {
                columns: Vec::new(),
                rows: Vec::new(),
                affected_rows: count,
                message: format!("Sucesso. Linhas afetadas: {}", count),
            }),
            Err(_) => Err(e.to_string()),
        },
    }
}

#[tauri::command]
pub async fn get_db_relationships(state: State<'_, AppState>) -> Result<Vec<Relationship>, String> {
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

    let query = "
        SELECT tc.table_name AS origin_table, kcu.column_name AS origin_column, ccu.table_name AS target_table, ccu.column_name AS target_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    ";

    let rows = client.query(query, &[]).await.map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|row| Relationship {
            origin_table: row.get(0),
            origin_column: row.get(1),
            target_table: row.get(2),
            target_column: row.get(3),
        })
        .collect())
}
