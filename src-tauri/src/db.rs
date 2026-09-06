use rusqlite::{types::ValueRef, Connection};
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<Connection>);

fn json_to_sql_value(val: &Value) -> Box<dyn rusqlite::types::ToSql> {
    match val {
        Value::Null => Box::new(rusqlite::types::Null),
        Value::Bool(b) => Box::new(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        Value::String(s) => Box::new(s.clone()),
        Value::Array(_) | Value::Object(_) => Box::new(val.to_string()),
    }
}

fn sql_value_ref_to_json(val: ValueRef<'_>) -> Value {
    match val {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(std::str::from_utf8(t).unwrap_or("")),
        ValueRef::Blob(b) => {
            let vec: Vec<Value> = b.iter().map(|&byte| Value::from(byte)).collect();
            Value::Array(vec)
        }
    }
}

#[tauri::command]
pub fn db_execute(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<u64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql_params: Vec<Box<dyn rusqlite::types::ToSql>> =
        params.iter().map(json_to_sql_value).collect();
    let slice: Vec<&dyn rusqlite::types::ToSql> =
        sql_params.iter().map(|b| b.as_ref()).collect();

    let changes = conn
        .execute(&sql, slice.as_slice())
        .map_err(|e| format!("db_execute error: {e}"))?;
    Ok(changes as u64)
}

#[tauri::command]
pub fn db_query(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Vec<Value>>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql_params: Vec<Box<dyn rusqlite::types::ToSql>> =
        params.iter().map(json_to_sql_value).collect();
    let slice: Vec<&dyn rusqlite::types::ToSql> =
        sql_params.iter().map(|b| b.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("db_query prepare error: {e}"))?;
    let col_count = stmt.column_count();

    let rows = stmt
        .query_map(slice.as_slice(), |row| {
            let mut row_values = Vec::with_capacity(col_count);
            for i in 0..col_count {
                let val_ref = row.get_ref(i)?;
                row_values.push(sql_value_ref_to_json(val_ref));
            }
            Ok(row_values)
        })
        .map_err(|e| format!("db_query execute error: {e}"))?;

    let mut results = Vec::new();
    for row in rows {
        let r = row.map_err(|e| format!("db_query row fetch error: {e}"))?;
        results.push(r);
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fts5_support() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE VIRTUAL TABLE test_fts USING fts5(content);", []).unwrap();
        conn.execute("INSERT INTO test_fts (content) VALUES (?);", ["hello world"]).unwrap();
    }
}

