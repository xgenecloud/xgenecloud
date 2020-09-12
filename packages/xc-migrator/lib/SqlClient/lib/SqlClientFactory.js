const MySqlClient = require("./mysql/MysqlClient");
const MssqlClient = require("./mssql/MssqlClient");
const SqliteClient = require("./sqlite/SqliteClient");
const PgClient = require("./pg/PgClient");

class SqlClientFactory {

  static create(connectionConfig) {
    connectionConfig.meta = connectionConfig.meta || {};
    connectionConfig.meta.dbtype = connectionConfig.meta.dbtype || "";
    if (connectionConfig.client === "mysql" || connectionConfig.client === "mysql2") {
      return new MySqlClient(connectionConfig);
    }
    if (connectionConfig.client === "sqlite3")
      return new SqliteClient(connectionConfig);
    if (connectionConfig.client === "mssql")
      return new MssqlClient(connectionConfig);
    if (connectionConfig.client === "pg") {
      return new PgClient(connectionConfig);
    }

    throw new Error("Database not supported");
  }
}

module.exports = SqlClientFactory;
