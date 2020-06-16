const path = require('path');
const glob = require('glob')
const fsExtra = require('fs-extra')

class ModelMgr {


  /***
   *
   * @param args
   * @param args.models
   * @param args.dbAlias
   * @param args.folder
   * @returns {Promise<void>}
   */
  static async removeModelBackups(args) {
    try {
      args.dbAlias = args.dbAlias || '*';
      if (args.models) {
        for (const model of args.models.split('.')) {
          for (const file of glob.sync(path.join(args.folder, 'server', 'models', args.dbAlias,model, `${model}.meta.*.js`))) {
            await fsExtra.remove(file)
            console.log(`Removed successfully : ${path.basename(file)}`.green.bold)
          }
        }
      } else {
        for (const file of glob.sync(path.join(args.folder, 'server', 'models', args.dbAlias, '*', '*.meta.*.js'))) {
          await fsExtra.remove(file)
          console.log(`Removed successfully : ${path.basename(file)}`.green.bold)
        }
      }
    }catch (e) {
      console.log(`Error while removing backup file`.red.bold)
    }

  }

}


module.exports =ModelMgr;