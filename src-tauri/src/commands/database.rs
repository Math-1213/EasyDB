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
    foreign_target_table: Option<String>,
    foreign_target_column: Option<String>,
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

#[derive(serde::Deserialize)]
pub struct BackendFilter {
    column: String,
    operator: String,
    value: String,
    value2: String,
}

#[derive(serde::Serialize)]
pub struct PaginatedTableData {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
    total_count: i64,
}

#[tauri::command]
pub async fn get_table_data(
    table_name: String,
    state: State<'_, AppState>,
) -> Result<TableData, String> {
    // Reutiliza a lógica paginada passando filtros vazios, sem ordenação e limite de 100
    let paginated_result = get_table_data_paginated(
        table_name,
        100,    // limit padrão antigo
        0,      // offset zero
        None,   // sort_column
        None,   // sort_direction
        vec![], // filtros vazios
        state,
    )
    .await?;

    // Converte o retorno para a estrutura TableData que a dashboard espera
    Ok(TableData {
        columns: paginated_result.columns,
        rows: paginated_result.rows,
    })
}

pub async fn get_primary_key_column(
    client: &tokio_postgres::Client,
    table_name: &str,
) -> Result<Option<String>, String> {
    let query = "
        SELECT kcu.column_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
        LIMIT 1;
    ";
    let rows = client
        .query(query, &[&table_name])
        .await
        .map_err(|e| e.to_string())?;
    if rows.is_empty() {
        Ok(None)
    } else {
        let pk: String = rows[0].get(0);
        Ok(Some(pk))
    }
}

#[tauri::command]
pub async fn get_table_data_paginated(
    table_name: String,
    limit: i64,
    offset: i64,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Vec<BackendFilter>,
    state: State<'_, AppState>,
) -> Result<PaginatedTableData, String> {
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

    // 1. Construção dinâmica dos filtros (Cláusula WHERE)
    let mut where_clauses = Vec::new();
    for f in &filters {
        if !f.column.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err("Nome de coluna inválido nos filtros".to_string());
        }

        let escaped_val = f.value.replace("'", "''");
        let escaped_val2 = f.value2.replace("'", "''");

        let clause = match f.operator.as_str() {
            "=" => format!("{}::text = '{}'", f.column, escaped_val),
            ">" => format!("{}::text > '{}'", f.column, escaped_val),
            ">=" => format!("{}::text >= '{}'", f.column, escaped_val),
            "<" => format!("{}::text < '{}'", f.column, escaped_val),
            "<=" => format!("{}::text <= '{}'", f.column, escaped_val),
            "contains" => format!("{}::text ILIKE '%{}%'", f.column, escaped_val),
            "starts_with" => format!("{}::text ILIKE '{}%'", f.column, escaped_val),
            "between" => format!(
                "{}::text BETWEEN '{}' AND '{}'",
                f.column, escaped_val, escaped_val2
            ),
            _ => "1=1".to_string(),
        };
        where_clauses.push(clause);
    }

    let where_string = if where_clauses.is_empty() {
        "WHERE 1=1".to_string()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // 2. Busca o total real de linhas afetadas por essa pesquisa específica
    let count_query = format!("SELECT COUNT(*) FROM {} {}", table_name, where_string);
    let count_row = client
        .query(&count_query, &[])
        .await
        .map_err(|e| e.to_string())?;
    let total_count: i64 = count_row.get(0).map(|r| r.get(0)).unwrap_or(0);

    // 3. Montagem das colunas convertendo Timestamps em strings formatadas via SQL
    let meta_query = format!("SELECT * FROM {} LIMIT 0", table_name);
    let meta_statement = client
        .prepare(&meta_query)
        .await
        .map_err(|e| e.to_string())?;

    // Extrai as colunas direto do Statement preparado (funciona mesmo com LIMIT 0)
    let columns: Vec<String> = meta_statement
        .columns()
        .iter()
        .map(|col| col.name().to_string())
        .collect();

    if columns.is_empty() {
        return Ok(PaginatedTableData {
            columns: vec![],
            rows: vec![],
            total_count: 0,
        });
    }

    let mut select_items = Vec::new();
    for col_info in meta_statement.columns() {
        let col = col_info.name();
        let type_name = col_info.type_().name();
        if type_name == "timestamp" || type_name == "timestamptz" {
            // Converte no formato ISO 8601 padrão diretamente no banco
            select_items.push(format!(
                "to_char(\"{}\", 'YYYY-MM-DD HH24:MI:SS') AS \"{}\"",
                col, col
            ));
        } else {
            select_items.push(format!("\"{}\"", col));
        }
    }
    let select_string = select_items.join(", ");

    // 4. Construção da cláusula ORDER BY
    let mut order_string = String::new();
    if let Some(col) = sort_column {
        if col.chars().all(|c| c.is_alphanumeric() || c == '_') {
            let dir = match sort_direction.as_deref() {
                Some("desc") => "DESC",
                _ => "ASC",
            };
            order_string = format!("ORDER BY \"{}\" {}", col, dir);
        }
    } else {
        // Se nenhuma coluna foi enviada, tenta buscar a PK da tabela para ordenar
        if let Ok(Some(pk)) = get_primary_key_column(&client, &table_name).await {
            order_string = format!("ORDER BY \"{}\" ASC", pk);
        }
    }

    // 5. Execução da Query Principal Paginada
    let query = format!(
        "SELECT {} FROM {} {} {} LIMIT {} OFFSET {}",
        select_string, table_name, where_string, order_string, limit, offset
    );
    let rows = client.query(&query, &[]).await.map_err(|e| e.to_string())?;

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
                _ => match row.try_get::<_, Option<String>>(i) {
                    Ok(Some(v)) => v,
                    _ => format!("[{}]", column_type),
                },
            };
            current_row.push(value);
        }
        grid_rows.push(current_row);
    }

    Ok(PaginatedTableData {
        columns,
        rows: grid_rows,
        total_count,
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

    // Query robusta para buscar metadados básicos e os alvos de FKs se existirem
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
            ) as is_foreign,
            fk.target_table,
            fk.target_column
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT 
                kcu.column_name,
                ccu.table_name AS target_table,
                ccu.column_name AS target_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
        ) fk ON c.column_name = fk.column_name
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
            foreign_target_table: row.get(6),
            foreign_target_column: row.get(7),
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

    println!("Executando SQL: {}", sql);

    match client.query(&sql, &[]).await {
        Ok(pg_rows) => {
            println!("Linhas retornadas: {}", pg_rows.len());
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
                        "date" | "timestamp" | "timestamptz" => {
                            // 1. Tenta timestamp com fuso horário (comum para timestamptz)
                            if let Ok(Some(dt)) =
                                row.try_get::<_, Option<chrono::DateTime<chrono::Utc>>>(i)
                            {
                                dt.format("%Y-%m-%d %H:%M:%S").to_string()
                            }
                            // 2. Tenta timestamp sem fuso horário (comum para timestamp)
                            else if let Ok(Some(ndt)) =
                                row.try_get::<_, Option<chrono::NaiveDateTime>>(i)
                            {
                                ndt.format("%Y-%m-%d %H:%M:%S").to_string()
                            }
                            // 3. Tenta data pura (comum para date)
                            else if let Ok(Some(d)) =
                                row.try_get::<_, Option<chrono::NaiveDate>>(i)
                            {
                                d.format("%Y-%m-%d").to_string()
                            }
                            // 4. Fallback direto
                            else if let Ok(Some(s)) = row.try_get::<_, Option<String>>(i) {
                                s
                            } else {
                                "NULL".to_string()
                            }
                        }
                        _ => match row.try_get::<_, Option<String>>(i) {
                            Ok(Some(v)) => v,
                            Ok(None) => "NULL".to_string(),
                            Err(_) => format!("[{}]", column_type),
                        },
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

// Função auxiliar para descobrir o nome da coluna Primary Key de uma tabela
#[tauri::command]
pub async fn update_table_cell(
    table_name: String,
    column_name: String,
    new_value: String,
    pk_column: String,
    pk_value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
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

    // Sanitização de identificadores
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_')
        || !column_name.chars().all(|c| c.is_alphanumeric() || c == '_')
        || !pk_column.chars().all(|c| c.is_alphanumeric() || c == '_')
    {
        return Err("Identificadores inválidos".to_string());
    }

    // Tratamento para valores nulos ou strings tratadas como texto
    let (update_value, value_is_null) = if new_value == "NULL" || new_value.is_empty() {
        ("NULL".to_string(), true)
    } else {
        (format!("'{}'", new_value.replace("'", "''")), false)
    };

    // Monta o update de forma segura usando cast para text na cláusula WHERE da PK
    let _query = if value_is_null {
        format!(
            "UPDATE {} SET \"{}\" = NULL WHERE \"{}\"::text = '{}'",
            table_name,
            column_name,
            pk_column,
            pk_value.replace("'", "''")
        )
    } else {
        format!(
            "UPDATE {} SET \"{}\" = {}::target_type WHERE \"{}\"::text = '{}'",
            // Usamos um truque do Postgres para tentar converter o texto de entrada para o tipo original da coluna
            table_name,
            column_name,
            update_value,
            pk_column,
            pk_value.replace("'", "''")
        )
        .replace("::target_type", "") // Remove o placeholder se preferir tipagem fraca do text
    };

    // Ajuste fino para o set aceitar a string convertida
    let query_final = format!(
        "UPDATE {} SET \"{}\" = '{}' WHERE \"{}\"::text = '{}'",
        table_name,
        column_name,
        new_value.replace("'", "''"),
        pk_column,
        pk_value.replace("'", "''")
    );

    // Se for NULL
    let query_final = if new_value == "NULL" {
        format!(
            "UPDATE {} SET \"{}\" = NULL WHERE \"{}\"::text = '{}'",
            table_name,
            column_name,
            pk_column,
            pk_value.replace("'", "''")
        )
    } else {
        query_final
    };

    client
        .execute(&query_final, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
