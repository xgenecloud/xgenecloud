const knex = require('./sql/CustomKnex');

class DbFactory {
  static create(connectionConfig) {
    if (connectionConfig.client === "sqlite3") {
      return knex(connectionConfig.connection)
    } else if (['mysql', 'mysql2', 'pg', 'mssql']) {
      return knex(connectionConfig)
    }
    throw new Error("Database not supported");
  }
}

module.exports = DbFactory;
