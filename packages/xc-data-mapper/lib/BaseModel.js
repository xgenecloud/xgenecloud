const Validator = require('validator');
const _ = require('lodash');
const autoBind = require('auto-bind');

/**
 * Base class for models
 *
 * @class
 * @classdesc Base class for models
 *
 */
class BaseModelSql {

  /**
   *
   * @param {Object} args
   * @param {Object} args.knex - Knex instance
   * @param {String} args.tableName - table name
   * @param {Object[]} args.columns - columns
   * @param {Object[]} args.pks - primary keys
   * @param {Object[]} args.hasMany - has many relations
   * @param {Object[]} args.belongsTo - belongs to relations
   * @param {Object} args.hooks - afterInsert, beforeInsert, errorInsert, afterUpdate, beforeUpdate, errorUpdate, afterDelete, beforeDelete, errorDelete
   * @returns {BaseModelSql} Returns {@link BaseModelSql} reference.
   *
   */
  constructor({
                dbDriver,
                tableName,
                columns,
                pks = [],
                hasMany = [],
                belongsTo = []
              }) {
    if (this.constructor === BaseModelSql) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.dbDriver = dbDriver;
    this.tableName = tableName;
    this.columns = columns;

    this.pks = columns.filter(c => c.primaryKey === true);
    this.hasManyRelations = hasMany;
    this.belongsToRelations = belongsTo;
    this.config = {
      limitMax: 500,
      limitMin: 1,
      limitDefault: 10,
      log: true,
      explain: false,
      hasManyMax: 5,
      bulkLengthMax: 1000,
      chunkSize: 50,
      stepMin: 1,
      stepsMax: 100,
      record: true,
      timeout: 25000
    };

    this.clientType = this.dbDriver.clientType();

    autoBind(this)
  }


  /**
   * Validates column values against validation functions
   *
   * @param {Object[]} columns - columns with values
   * @memberof BaseModel
   * @returns Promise<Boolean>
   * @throws {Error}
   */
  async validate(columns) {
    // let cols = Object.keys(this.columns);
    for (let i = 0; i < this.columns.length; ++i) {
      let {validate: {func, args, msg}, columnName} = this.columns[i];
      for (let j = 0; j < func.length; ++j) {
        const fn = typeof func[j] === 'string' ? Validator[func[j]] : func[j];
        const arg = typeof func[j] === 'string' ? columns[columnName] + "" : columns[columnName];
        if (columnName in columns && !(fn.constructor.name === "AsyncFunction" ? await fn(arg) : fn(arg)))
          throw new Error(msg[j])
      }
    }
    return true;
  }

  /**
   *
   * @returns {Object} knex instance attached to a table
   */
  get $db() {
    return this.dbDriver(this.tableName);
  }

  /**
   * _wherePk
   *
   * @param {String} id - pk separated by ___
   * @returns {Object} - primary key where condition
   * @private
   */
  _wherePk(id) {
    let ids = (id + '').split('___');
    let where = {};
    for (let i = 0; i < this.pks.length; ++i) {
      where[this.pks[i].columnName] = ids[i];
    }
    return where;
  }

  /**
   * _whereFk
   *
   * @param {Object} args
   * @param {String} args.parentTableName - parent table name
   * @param {String} args.parentId - foreign key
   * @returns {Object} - foreign key where condition
   * @private
   */
  _whereFk({parentTableName, parentId}) {
    let {referencedColumnName} = this.belongsToRelations.find(({referencedTableName}) => referencedTableName === parentTableName)
    let where = {[referencedColumnName]: parentId};
    return where;
  }

  /**
   *
   * @param obj
   * @returns {{}}
   * @private
   */
  _extractPks(obj) {
    let objCopy = JSON.parse(JSON.stringify(obj));
    for (let key in obj) {
      if (this.pks.filter(pk => pk.columnName === key).length === 0) {
        delete objCopy[key];
      }
    }
    return objCopy;
  }


  /**
   * Creates row in table
   *
   * @param {Object} data - row data
   * @returns {Promise<*>}
   */
  async insert(data, trx) {

    try {

      if ('beforeInsert' in this) {
        await this.beforeInsert(data)
      }

      let response;

      await this.validate(data);

      const query = this.$db.insert(data);

      if (this.dbDriver.clientType() === 'pg' || this.dbDriver.clientType() === 'mssql') {
        query.returning('*');
        response = await this._run(query);
      } else {
        response = data;
        const res = await this._run(query);
        const autoIncrement = this.columns.find(c => c.autoIncrement);
        if (autoIncrement) {
          response[autoIncrement.columnName] = res[0];
        }
      }
      await this.afterInsert(response);
      return response;
    } catch (e) {
      console.log(e);
      await this.errorInsert(e, data)
      throw e;
    }
  }


  /**
   * Creates row in this table under a certain parent
   *
   * @param {Object} args
   * @param {Object} args.data - row data
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @returns {Promise<*>}
   * @todo should return inserted record
   */
  async insertByFk({parentId, parentTableName, data}, trx) {

    try {

      await this.beforeInsert(data);

      let response;

      await this.validate(data);
      Object.assign(data, this._whereFk({parentId, parentTableName}))

      const query = this.$db.insert(data);

      if (this.dbDriver.clientType() === 'pg' || this.dbDriver.clientType() === 'mssql') {
        query.returning('*');
        response = await this._run(query);
      } else {
        response = data;
        const res = await this._run(query);
        const autoIncrement = this.columns.find(c => c.autoIncrement);
        if (autoIncrement) {
          response[autoIncrement.columnName] = res[0];
        }
      }

      await this.afterInsert(data)
      return response;
    } catch (e) {
      console.log(e);
      await this.errorInsert(e, data)
      throw e;
    }
  }

  /**
   * Creates multiple rows in table
   *
   * @param {Object[]} data - row data
   * @returns {Promise<*>}
   */
  async insertb(data) {

    try {

      await this.beforeInsertb(data)

      let response;

      for (let d of data) {
        await this.validate(d);
      }

      response = await this.dbDriver.batchInsert(this.tableName, data, 50)
        .returning(this.pks[0].columnName);

      await this.afterInsertb(data);

      return response;

    } catch (e) {
      await this.errorInsertb(e, data);
      throw e;
    }
  }

  /**
   * Reads table row data
   *
   * @param {String} id - primary key separated by ___
   * @returns {Object} Table row data
   */
  async readByPk(id) {
    try {
      return await this._run(this.$db.select().where(this._wherePk(id)).first());
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Reads table row data under a certain parent
   *
   * @param {Object} args
   * @param {Object} args.id - primary key separated by ___
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @returns {Promise<Object>} returns row
   */
  async readByFk({id, parentId, parentTableName}) {
    try {

      return await this._run(this.$db.select().where(this._wherePk(id)).andWhere(this._whereFk({
        parentTableName,
        parentId
      })).limit(1));
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Get the list of rows in table
   *
   * @param {object} args
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<object[]>} rows
   * @memberof BaseModel
   * @throws {Error}
   */
  async list(args) {

    try {

      const {fields, where, limit, offset, sort} = this._getListArgs(args);

      let query = this.$db.select(...fields.split(','))
        .xwhere(where);

      this._paginateAndSort(query, {limit, offset, sort});

      return await this._run(query);

    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Get the first row from the select query
   *
   * @param {object} args
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {object} row
   * @memberof BaseModel
   * @throws {Error}
   */
  async findOne(args) {
    try {
      const {fields, where} = this._getListArgs(args);
      let query = this.$db.select(fields)
        .xwhere(where).first();
      this._paginateAndSort(query, args)
      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Get the first row from the select query
   *
   * @param {object} args
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @returns {object} row
   * @memberof BaseModel
   * @throws {Error}
   */
  async findOneByFk({parentId, parentTableName, ...args}) {
    try {
      const {fields, where} = this._getListArgs(args);
      let query = this.$db.select(fields)
        .where(this._whereFk({parentId, parentTableName}))
        .xwhere(where).first();
      this._paginateAndSort(query, args)
      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Get the count of rows based on the where
   *
   * @param {object} args
   * @param {String} [args.where]  - where clause with conditions within ()
   * @returns {Promise<Object>}
   * @memberof BaseModel
   * @throws {Error}
   */
  async countByPk({where}) {
    try {
      return await this._run(this.$db.count(`${(this.pks[0] || this.columns[0]).columnName} as count`)
        .xwhere(where)
        .first());
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Get the count of rows based on the where
   *
   * @param {object} args
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @returns {Promise<Object>}
   * @memberof BaseModel
   * @throws {Error}
   */
  async countByFk({where, parentId, parentTableName}) {
    try {
      return await this._run(this.$db.where(this._whereFk({
        parentId,
        parentTableName
      })).count(`${(this.pks[0] || this.columns[0]).columnName} as count`)
        .xwhere(where)
        .first());
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Update table row data by primary key
   *
   * @param {String} id - primary key separated by ___
   * @param {Object} data - table row data
   * @returns {Number} 1 for success, 0 for failure
   */
  async updateByPk(id, data, trx) {
    try {
      await this.beforeUpdate(data);

      let response;

      // this.validate(data);
      response = await this._run(this.$db.update(data).where(this._wherePk(id)));
      await this.afterUpdate(data);
      return response;
    } catch (e) {
      console.log(e);
      await this.errorUpdate(e, data);
      throw e;
    }
  }

  /**
   * Update table row data by primary key and foreign key
   *
   * @param {Object} args
   * @param {String} args.id - primary key separated by ___
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @param {Object} args.data - table row data
   * @returns {Number} 1 for success, 0 for failure
   */
  async updateByFk({id, parentId, parentTableName, data}, trx) {
    try {
      await this.beforeUpdate();

      let response;

      // this.validate(data);
      response = await this._run(this.$db.update(data).where(this._wherePk(id)).andWhere(this._whereFk({
        parentTableName,
        parentId
      })));
      await this.afterUpdate();
      return response;
    } catch (e) {
      console.log(e);
      await this.errorUpdate(e, data);
      throw e;
    }
  }


  /**
   * Delete table row data by primary key
   *
   * @param {String} id - primary key separated by ___
   * @returns {Number} 1 for success, 0 for failure
   */
  async delByPk(id, trx) {
    try {
      await this.beforeDelete();

      let response;

      response = await this._run(this.$db.del().where(this._wherePk(id)));
      await this.afterDelete();
      return response;
    } catch (e) {
      console.log(e);
      await this.errorDelete(e, data);
      throw e;
    }
  }


  /**
   * Delete table row data by primary key and foreign key
   *
   * @param {Object} args
   * @param {String} args.id - primary key separated by ___
   * @param {String} args.parentId - parent table id
   * @param {String} args.parentTableName - parent table name
   * @returns {Number} 1 for success, 0 for failure
   */
  async delByFk({id, parentId, parentTableName}, trx) {
    try {
      await this.beforeDelete();

      let response;

      response = await this._run(this.$db.del().where(this._wherePk(id)).andWhere(this._whereFk({
        parentTableName,
        parentId
      })));
      await this.afterDelete();
      return response;
    } catch (e) {
      console.log(e);
      await this.errorDelete(e, data);
      throw e;
    }
  }

  /**
   * Update bulk - happens within a transaction
   *
   * @param {Object[]} data - table rows to be updated
   * @returns {Promise<Number[]>} - 1 for success, 0 for failure
   */
  async updateb(data) {

    let trx;
    try {

      await this.beforeUpdateb();

      trx = await this.dbDriver.transaction();

      let res = [];
      for (let d of data) {
        // this.validate(d);
        let response = await this._run(trx(this.tableName).update(d).where(this._extractPks(d)));
        res.push(response);
      }

      trx.commit();
      await this.afterUpdateb();

      return res;

    } catch (e) {
      if (trx)
        trx.rollback();
      console.log(e);
      await this.errorUpdateb(e, data);
      throw e;
    }
  }


  /**
   * Bulk delete happens within a transaction
   *
   * @param {Object[]} ids - rows to be deleted
   * @returns {Promise<Number[]>} - 1 for success, 0 for failure
   */
  async delb(ids) {
    let trx;
    try {
      await this.beforeDeleteb();
      trx = await this.dbDriver.transaction();

      let res = [];
      for (let d of ids) {
        let response = await this._run(trx(this.tableName).del().where(this._extractPks(d)));
        res.push(response);
      }
      trx.commit();

      await this.afterDeleteb();

      return res;

    } catch (e) {
      if (trx)
        trx.rollback();
      console.log(e);
      await this.errorDeleteb(e, data);
      throw e;
    }

  }

  /**
   * Table row exists
   *
   * @param {String} id - ___ separated primary key string
   * @returns {Promise<boolean>} - true for exits and false for none
   */
  async exists(id) {
    try {
      return Object.keys((await this.readByPk(id))).length !== 0;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Table row exists
   *
   * @param {String} id - ___ separated primary key string
   * @returns {Promise<boolean>} - true for exits and false for none
   */
  async existsByFk({id, parentId, parentTableName}) {
    try {
      return (await this.readByFk({id, parentId, parentTableName})).length !== 0;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Get the rows by group by
   *
   * @param {object} args
   * @param {String} args.columnName - column name of this table()
   * @param {String} [args.fields] - commas separated column names of this table
   * @param {String} [args.having]  - having clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<object[]>} rows
   * @memberof BaseModel
   * @throws {Error}
   */
  async groupBy({having, fields = '', columnName, limit, offset, sort}) {
    try {
      const columns = [...(columnName ? [columnName] : []), ...fields.split(',').filter(Boolean)];
      let query = this.$db
        .groupBy(columns)
        .count(`${(this.pks[0] || this.columns[0]).columnName} as count`)
        .select(columns)
        .xhaving(having);

      this._paginateAndSort(query, {limit, offset, sort});

      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Get the rows by aggregation by an aggregation function(s)
   *
   * @param {object} args
   * @param {String} args.func - comma separated aggregation functions
   * @param {String} args.columnName - column name of this table()
   * @param {String} [args.fields] - commas separated column names of this table
   * @param {String} [args.having]  - having clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<object[]>} rows - aggregated rows by function names
   * @memberof BaseModel
   * @throws {Error}
   */
  async aggregate({having, fields = '', func, columnName, limit, offset, sort}) {
    try {
      let query = this.$db
        .select(...fields.split(','))
        .xhaving(having);

      if (fields) {
        query.groupBy(...fields.split(','))
      }
      if (func && columnName) {
        func.split(',').forEach(fn => query[fn](`${columnName} as ${fn}`))
      }


      this._paginateAndSort(query, {limit, offset, sort});

      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Distribution of column values in the table
   *
   * @param {object} args
   * @param {String} [args.func=count] - comma separated aggregation functions
   * @param {String} args.columnName - column name of this table()
   * @param {String} [args.steps]  - comma separated ascending numbers
   * @param {String} [args.min] - minimum value
   * @param {String} [args.max] - maximum value
   * @param {String} [args.step] - step value
   * @returns {Promise<object[]>} Distributions of column values in table
   * @example
   * table.distribution({
   *   columnName : 'price',
   *   steps: '0,100,200,300,400',
   *   func: 'sum,avg'
   * })
   * @example
   * table.distribution({
   *   columnName : 'price',
   *   min: '0',
   *   max: '400',
   *   step: '100',
   *   func: 'sum,avg'
   * })
   * @memberof BaseModel
   * @throws {Error}
   */
  async distribution({columnName, steps, func = 'count', min, max, step}) {

    try {
      const ranges = [];

      const generateWindows = (ranges, min, max, step) => {
        max = +max;
        step = +step;

        for (let i = 0; i < max / step; i++) {
          ranges.push([i * step + (i && 1), Math.min((i + 1) * step, max)])
        }
      };


      if (!isNaN(+min) && !isNaN(+max) && !isNaN(+step)) {
        generateWindows(ranges, min, max, step)
      } else if (steps) {
        const splitArr = steps.split(',');
        for (let i = 0; i < splitArr.length - 1; i++) {
          ranges.push([+splitArr[i] + (i ? 1 : 0), splitArr[i + 1]])
        }
      } else {
        const {min, max, step} = await this.$db
          .min(`${columnName} as min`)
          .max(`${columnName} as max`)
          .avg(`${columnName} as step`)
          .first();
        generateWindows(ranges, min, max, Math.round(step))
      }

      return await this.dbDriver.unionAll(
        ...ranges.map(([start, end]) => {
            const query = this.$db.xwhere(`(${columnName},ge,${start})~and(${columnName},le,${end})`);
            if (func) {
              func.split(',').forEach(fn => query[fn](`${columnName} as ${fn}`))
            }
            return this.isSqlite() ? this.dbDriver.select().from(query) : query;
          }
        ), !this.isSqlite()
      ).map((row, i) => {
        row.range = ranges[i].join('-');
        return row;
      });
    } catch (e) {
      console.log(e);
      throw e;
    }

  }


  /**
   * Get the list of distinct rows
   *
   * @param {object} args
   * @param {String} args.columnName - column name of this table()
   * @param {String} [args.fields] - commas separated column names of this table
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<object[]>} rows
   * @memberof BaseModel
   * @throws {Error}
   */
  async distinct({columnName, fields = '', where, limit, offset, sort}) {
    try {
      let query = this.$db;
      query.distinct(columnName, ...fields.split(',').filter(Boolean));
      query.xwhere(where);
      this._paginateAndSort(query, {limit, offset, sort});
      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Runs raw query on database
   *
   * @param {String} queryString - query string
   * @param {Object[]} params - paramaterised values in an array for query
   * @returns {Promise<*>} - return raw data from database driver
   */
  async raw(queryString, params = []) {
    try {
      let query = this.dbDriver.raw(queryString, params);
      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Get child list and map to input parent
   *
   * @param {Object[]} parent - parent list array
   * @param {String} child - child table name
   * @param {Object} rest - index suffixed fields, limit, offset, where and sort
   * @param index - child table index
   * @returns {Promise<void>}
   * @private
   */
  async _getChildListInParent({parent, child}, rest = {}, index) {
    let {fields, where, limit, offset, sort} = this._getChildListArgs(rest, index);
    const {columnName} = this.hasManyRelations.find(({tableName}) => tableName === child) || {};

    if (fields !== '*' && fields.split(',').indexOf(columnName) === -1) {
      fields += ',' + columnName;
    }


    let childs = await this._run(this.dbDriver.union(
      parent.map(p => {
        const query = this
          .dbDriver(child)
          .where({[columnName]: p[this.pks[0].columnName]})
          .xwhere(where)
          .select(...fields.split(','));

        this._paginateAndSort(query, {sort, limit, offset});
        return this.isSqlite() ? this.dbDriver.select().from(query) : query;
      }), !this.isSqlite()
    ));

    let gs = _.groupBy(childs, columnName);
    parent.forEach(row => {
      row[child] = gs[row[this.pks[0].columnName]] || [];
    })
  }

  /**
   * Gets child rows for a parent row in this table
   *
   * @param {Object} args
   * @param {String} args.child - child table name
   * @param {String} args.parentId - pk
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<Object[]>} return child rows
   */
  async hasManyChildren({child, parentId, ...args}) {
    try {
      const {fields, where, limit, offset, sort} = this._getListArgs(args);
      const {referencedColumnName} = this.hasManyRelations.find(({tableName}) => tableName === child) || {};

      let query = this.dbDriver(child).select(...fields.split(','))
        .where(referencedColumnName, parentId)
        .xwhere(where);

      this._paginateAndSort(query, {limit, offset, sort});
      return await this._run(query);
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Gets parent list along with children list
   *
   * @param {Object} args
   * @param {String} args.childs - comma separated child table names
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.fields*=*] - commas separated column names of child table(* is a natural number 'i' where i is index of child table in comma separated list)
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.where*] - where clause with conditions within ()(* is a natural number 'i' where i is index of child table in comma separated list)
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.limit*] -  number of rows to be limited  of child table(* is a natural number 'i' where i is index of child table in comma separated list)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.offset*] - offset from which to get the number of rows of child table(* is a natural number 'i' where i is index of child table in comma separated list)
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @param {String} [args.sort*] - comma separated column names where each column name is columnName ascending and -columnName is columnName descending(* is a natural number 'i' where i is index of child table in comma separated list)
   * @returns {Promise<Object[]>}
   */
  async hasManyList({childs, where, fields, f, ...rest}) {
    fields = fields || f || '*';
    try {

      if (fields !== '*' && fields.split(',').indexOf(this.pks[0].columnName) === -1) {
        fields += ',' + this.pks[0].columnName;
      }

      const parent = await this.list({childs, where, fields, ...rest});
      if (parent && parent.length)
        await Promise.all([...new Set(childs.split('.'))].map((child, index) => this._getChildListInParent({
          parent,
          child
        }, rest, index)));
      return parent;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Gets child list along with its parent
   *
   * @param {Object} args
   * @param {String} args.parents - comma separated parent table names
   * @param {String} [args.fields=*] - commas separated column names of this table
   * @param {String} [args.fields*=*] - commas separated column names of parent table(* is a natural number 'i' where i is index of child table in comma separated list)
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<Object[]>}
   */
  async belongsTo({parents, where, fields, f, ...rest}) {
    fields = fields || f || '*';
    try {

      for (let parent of parents.split('~')) {
        const {columnName} = this.belongsToRelations.find(({referencedTableName}) => referencedTableName === parent) || {};
        if (fields !== '*' && fields.split(',').indexOf(columnName) === -1) {
          fields += ',' + columnName;
        }
      }

      const childs = await this.list({where, fields, ...rest});


      await Promise.all(parents.split('~').map((parent, index) => {
        const {columnName, referencedColumnName} = this.belongsToRelations.find(({referencedTableName}) => referencedTableName === parent) || {};
        const parentIds = [...new Set(childs.map(c => c[columnName]))];
        return this._belongsTo({parent, referencedColumnName, parentIds, childs, columnName, ...rest}, index);
      }))

      return childs;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }


  /**
   * Get parent and map to input child
   *
   * @param {String} parent - parent table name
   * @param {Object} childs - children list
   * @param {Object} rest - index suffixed fields, limit, offset, where and sort
   * @param index - child table index
   * @param {String} [args.fields*=*] - commas separated column names of parent table(* is a natural number 'i' where i is index of child table in comma separated list)
   * @returns {Promise<void>}
   * @private
   */
  async _belongsTo({parent, referencedColumnName, parentIds, childs, columnName, ...rest}, index) {
    let {fields} = this._getChildListArgs(rest, index);
    if (fields !== '*' && fields.split(',').indexOf(referencedColumnName) === -1) {
      fields += ',' + referencedColumnName;
    }

    const parents = await this._run(this.dbDriver(parent).select(...fields.split(',')).whereIn(referencedColumnName, parentIds));

    let gs = _.groupBy(parents, referencedColumnName);

    childs.forEach(row => {
      row[parent] = gs[row[columnName]] && gs[row[columnName]][0];
    })
  }

  /**
   * Returns key value paired grouped children list
   *
   * @param {Object} args
   * @param {String} args.child - child table name
   * @param {String[]} ids  - array of parent primary keys
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<Object.<string, Object[]>>}  key will be parent pk and value will be child list
   */
  async hasManyListGQL({child, ids, ...rest}) {
    try {
      let {fields, where, limit, offset, sort} = this._getChildListArgs(rest);

      const {columnName} = this.hasManyRelations.find(({tableName}) => tableName === child) || {};

      if (fields !== '*' && fields.split(',').indexOf(columnName) === -1) {
        fields += ',' + columnName;
      }

      let childs = await this._run(this.dbDriver.union(
        ids.map(p => {
          const query = this
            .dbDriver(child)
            .where({[columnName]: p})
            .xwhere(where)
            .select(...fields.split(','));

          this._paginateAndSort(query, {sort, limit, offset});
          return this.isSqlite() ? this.dbDriver.select().from(query) : query;
        }), !this.isSqlite()
      ));


      return _.groupBy(childs, columnName);

    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  isSqlite() {
    return this.clientType === 'sqlite3';
  }

  /**
   * Returns key value paired grouped children list
   *
   * @param {Object} args
   * @param {String} args.child - child table name
   * @param {String[]} ids  - array of parent primary keys
   * @param {String} [args.where]  - where clause with conditions within ()
   * @param {String} [args.limit]  - number of rows to be limited (has default,min,max values in config)
   * @param {String} [args.offset] - offset from which to get the number of rows
   * @param {String} [args.sort]   - comma separated column names where each column name is columnName ascending and -columnName is columnName descending
   * @returns {Promise<Object.<string, Object[]>>}  key will be parent pk and value will be child list
   */
  async hasManyListCount({child, ids, ...rest}) {
    try {
      let {where} = this._getChildListArgs(rest);

      const {columnName} = this.hasManyRelations.find(({tableName}) => tableName === child) || {};

      let childs = await this._run(this.dbDriver.unionAll(
        ids.map(p => {
          const query = this
            .dbDriver(child)
            .where({[columnName]: p})
            .xwhere(where)
            .count(`${columnName} as count`)
            .first();
          return this.isSqlite() ? this.dbDriver.select().from(query) : query;
        }), !this.isSqlite()
      ));

      return childs.map(({count}) => count);
      // return _.groupBy(childs, columnName);

    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  /**
   * Adds default params to limit, ofgste and sort params
   *
   * @param {Object} query - knex query builder
   * @param {Object} args
   * @param {string} args.limit - limit
   * @param {string} args.offset - offset
   * @param {string} args.sort - sort
   * @returns {Object} query appended with paginate and sort params
   * @private
   */
  _paginateAndSort(query, {limit = 20, offset = 0, sort = ''}) {
    query.offset(offset)
      .limit(limit);

    if (sort) {
      sort.split(',').forEach(o => {
        if (o[0] === '-') {
          query.orderBy(o.slice(1), 'desc')
        } else {
          query.orderBy(o, 'asc')
        }
      })
    }
    return query;
  }

  /**
   * Runs a query built by knex, measure and logs time
   *
   * @param query
   * @returns {Promise<*>}
   * @private
   */
  async _run(query) {
    try {
      // if (this.config.log) {
      //   const q = query.toQuery();
      //   console.time(q);
      //   const data = await query;
      //   console.timeEnd(q);
      //   return data;
      // } else {
      return await query;
      // }
    } catch (e) {
      throw e;
    }
  }

  /**
   * Gets the default list of args for querying a table
   *
   * @param {Object} args - fields,where,limit,offset,sort indexed
   * @returns {Object} consisting of fields,where,limit,offset,sort
   * @private
   */
  _getListArgs(args) {
    let obj = {};
    obj.where = args.where || args.w || '';
    obj.limit = Math.max(Math.min(args.limit || args.l || this.config.limitDefault, this.config.limitMax), this.config.limitMin);
    obj.offset = args.offset || args.o || 0;
    obj.fields = args.fields || args.f || '*';
    obj.sort = args.sort || args.s;
    return obj;
  }

  /**
   * Gets the default args for child list
   *
   * @param {Object} args - fields,where,limit,offset,sort indexed
   * @param {Number} index
   * @returns {Object} consisting of fields*,where*,limit*,offset*,sort*
   * @private
   */
  _getChildListArgs(args, index) {
    index++;
    let obj = {};
    obj.where = args[`where${index}`] || args[`w${index}`] || '';
    obj.limit = Math.max(Math.min(args[`limit${index}`] || args[`l${index}`] || this.config.limitDefault, this.config.limitMax), this.config.limitMin);
    obj.offset = args[`offset${index}`] || args[`o${index}`] || 0;
    obj.fields = args[`fields${index}`] || args[`f${index}`] || '*';
    obj.sort = args[`sort${index}`] || args[`s${index}`];
    return obj;
  }


  async beforeInsert(data) {

  }

  async afterInsert(response) {

  }

  async errorInsert(err, data) {

  }

  async beforeUpdate(data) {

  }

  async afterUpdate(response) {

  }

  async errorUpdate(err, data) {

  }

  async beforeDelete(data) {

  }

  async afterDelete(response) {

  }

  async errorDelete(err, data) {

  }


  async beforeInsertb(data) {

  }

  async afterInsertb(response) {

  }

  async errorInsertb(err, data) {

  }

  async beforeUpdateb(data) {

  }

  async afterUpdateb(response) {

  }

  async errorUpdateb(err, data) {

  }

  async beforeDeleteb(data) {

  }

  async afterDeleteb(response) {

  }

  async errorDeleteb(err, data) {

  }

}


module.exports = BaseModelSql;