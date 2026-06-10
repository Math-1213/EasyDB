use crate::state::{get_tls_connector, AppState};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
pub struct DbConfig {
    host: String,
    port: String,
    user: String,
    password: Option<String>,
    database: String,
}

#[tauri::command]
pub async fn connect_db(config: DbConfig, state: State<'_, AppState>) -> Result<String, String> {
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

#[tauri::command]
pub async fn get_databases(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    // Isola o acesso ao Mutex dentro de um bloco para dropar o guard imediatamente
    let conn_str = {
        let conn_str_guard = state.connection_string.lock().unwrap();
        conn_str_guard.as_ref().ok_or("Não conectado")?.clone()
    }; // <-- O lock morre aqui de forma garantida

    let connector = get_tls_connector()?;

    // Agora o compilador sabe que nenhuma thread carregará o MutexGuard no .await abaixo
    let (client, connection) = tokio_postgres::connect(&conn_str, connector)
        .await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Erro na conexão de catálogo: {}", e);
        }
    });

    let rows = client
        .query(
            "SELECT datname FROM pg_database WHERE datistemplate = false",
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let dbs = rows.iter().map(|row| row.get::<_, String>(0)).collect();
    Ok(dbs)
}

#[tauri::command]
pub async fn switch_database(new_db: String, state: State<'_, AppState>) -> Result<String, String> {
    // 1. Abre o lock em um bloco isolado (escopo menor) apenas para ler e gerar a nova string
    let new_conn_str = {
        let conn_str_guard = state.connection_string.lock().unwrap();
        let current_str = conn_str_guard.as_ref().ok_or("Não conectado")?;

        let parts: Vec<String> = current_str
            .split_whitespace()
            .map(|part| {
                if part.starts_with("dbname=") {
                    format!("dbname={}", new_db)
                } else {
                    part.to_string()
                }
            })
            .collect();

        parts.join(" ")
    }; // <-- O MutexGuard morre exatamente aqui!

    // 2. Agora o .await do connect está livre do lock e seguro entre threads
    let connector = get_tls_connector()?;
    match tokio_postgres::connect(&new_conn_str, connector).await {
        Ok((_, connection)) => {
            tokio::spawn(async move {
                let _ = connection.await;
            });

            // 3. Abre o lock novamente, de forma rápida, apenas para salvar o valor atualizado
            let mut conn_guard = state.connection_string.lock().unwrap();
            *conn_guard = Some(new_conn_str);

            Ok("Banco alterado com sucesso!".to_string())
        }
        Err(e) => Err(format!("Falha ao conectar no novo banco: {}", e)),
    }
}
