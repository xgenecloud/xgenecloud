const path = require('path');
const glob = require('glob');
const fs = require('fs');
const jsonfile = require('jsonfile');
const colors = require('colors');
const Util = require('../util/Util');

var Table = require('cli-table3');

class PermissionsMgr {

  static async set(args) {

    if (Util.isProjectGraphql()) {
      try {

        if (args._.length < 4) {
          console.warn('Invalid arguments for : xc permissions.set')
          return;
        }


        let [_, models, users, ...resolvers] = args._;
        models = models.split('.');
        users = users.split('.');

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];

          if (models.includes(modelName) || models[0] === '$') {
            let filePermissions = require(file).permissions;

            const roles = Object.values(filePermissions)
              .flatMap(roles => Object.keys(roles))
              .filter((v, i, arr) => arr.indexOf(v) === i);

            if (users[0] === '$') {
              for (let [route, rolesObj] of Object.entries(filePermissions)) {

                if (resolvers[0] === '*=1') {
                  const permObj = roles.reduce((obj, role) => {
                    obj[role] = true;
                    return obj;
                  }, {});

                  Object.assign(rolesObj, permObj)
                  console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')}  resolver: ${route}`);
                } else if (resolvers[0] === '*=0') {
                  const permObj = roles.reduce((obj, role) => {
                    obj[role] = false;
                    return obj;
                  }, {});

                  Object.assign(rolesObj, permObj)
                  console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')}  resolver: ${route}`);
                } else {
                  resolvers.forEach(permission => {
                    const permTuple = permission.split('=')
                    if (route === permTuple[0]) {
                      const permObj = roles.reduce((obj, role) => {
                        const val = !!(permTuple.length === 1 ? 1 : +permTuple[1] || 0);
                        obj[role] = val;
                        return obj;
                      }, {});
                      Object.assign(rolesObj, permObj)
                      console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')} , resolver: ${route}`);
                    }
                  })
                }

              }

            } else {


              for (let [route, rolesObj] of Object.entries(filePermissions)) {
                resolvers.forEach(permission => {
                  const permTuple = permission.split('=')
                  if (route === permTuple[0]) {
                    const permObj = roles.reduce((obj, role) => {
                      const val = !!(permTuple.length === 1 ? 1 : +permTuple[1] || 0);
                      obj[role] = val;
                      return obj;
                    }, {});
                    Object.assign(rolesObj, permObj)
                    console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')} , resolver: ${route}`);
                  }
                })
              }
            }

            let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
            fs.writeFileSync(file, policyFileContent)

          }

        });

      } catch (e) {
        console.error(`Error in xc permissions.set`, e);
      }
    } else {


      try {

        if (args._.length < 4) {
          console.warn('Invalid arguments for : xc permissions.set')
          return;
        }


        let [_, models, users, ...permissions] = args._;
        models = models.split('.');
        users = users.split('.');

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];

          if (models.includes(modelName) || models[0] === '$') {

            let filePermissions = require(file).permissions;

            if (users[0] === '$') {


              const roles = Object.values(filePermissions)
                .flatMap(
                  methods => Object.values(methods)
                    .flatMap(roles => Object.keys(roles))
                )
                .filter((v, i, arr) => arr.indexOf(v) === i);


              for (let [route, methods] of Object.entries(filePermissions)) {

                if (permissions[0] === '*=1') {
                  const permObj = roles.reduce((obj, role) => {
                    obj[role] = true;
                    return obj;
                  }, {});

                  for (let [method, rolesObj] of Object.entries(methods)) {
                    Object.assign(rolesObj, permObj)
                    console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')} method: ${method}=true, route: ${route}`);
                  }
                } else if (permissions[0] === '*=0') {
                  const permObj = roles.reduce((obj, role) => {
                    obj[role] = false;
                    return obj;
                  }, {});
                  for (let [method, rolesObj] of Object.entries(methods)) {
                    Object.assign(rolesObj, permObj)
                    console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')} method: ${method}=false, route: ${route}`);
                  }
                } else {
                  permissions.forEach(permission => {
                    const permTuple = permission.split('=')
                    const val = !!(permTuple.length === 1 ? 1 : +permTuple[1] || 0);
                    const permObj = roles.reduce((obj, role) => {
                      obj[role] = val;
                      return obj;
                    }, {});
                    if (methods[permTuple[0]]) {
                      Object.assign(methods[permTuple[0]], permObj)
                      console.log(`Setting Permissions for model:${modelName} roles:${roles.join(', ')} method: ${permTuple[0]}=${val}, route: ${route}`);
                    }
                  })
                }

              }

            } else {


              for (let [route, methods] of Object.entries(filePermissions)) {
                permissions.forEach(permission => {
                  const permTuple = permission.split('=')
                  const val = !!(permTuple.length === 1 ? 1 : +permTuple[1] || 0);
                  const permObj = users.reduce((obj, role) => {
                    obj[role] = val;
                    return obj;
                  }, {});
                  if (methods[permTuple[0]]) {
                    Object.assign(methods[permTuple[0]], permObj)
                    console.log(`Setting Permissions for model:${modelName} roles:${users.join(', ')} method: ${permTuple[0]}=${val}, route: ${route}`);
                  } else if (permTuple[0] === '*') {
                    for (let [method, rolesObj] of Object.entries(methods)) {
                      Object.assign(rolesObj, permObj)
                      console.log(`Setting Permissions for model:${modelName} roles:${users.join(', ')} method: ${method}=${val}, route: ${route}`);
                    }
                  }
                })
              }


            }

            let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
            fs.writeFileSync(file, policyFileContent)

          }

        });

      } catch (e) {
        console.error(`Error in xc permissions.set`, e);
      }
    }
  }

  static async get(args) {

    if (Util.isProjectGraphql()) {
      try {
        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.get')
          return;
        }

        let [_, models] = args._;
        models = models.split('.');

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');


        // instantiate
        let rows = [], roles = [];


        glob.sync(policiesPath).forEach((file) => {
          let filePermissions = require(file).permissions;

          const modelName = path.basename(file).split('.')[0];

          if (models.includes(modelName)) {
            let filePermissions = require(file).permissions;


            roles = Object.values(filePermissions)
              .flatMap(
                roles => Object.keys(roles))
              .filter((v, i, arr) => arr.indexOf(v) === i);

            rows.push([{colSpan: roles.length + 1, content: colors.green(file), hAlign: 'center'}])

            for (let [route, methods] of Object.entries(filePermissions)) {
              let i = 0;
              let row = [{content: route, vAlign: 'center'}];
              for (let role of roles) {
                row.push(methods[role] ? colors.green('✔️') : colors.red('x'));
              }
              rows.push(row)
            }
          }
        })


        const table = new Table({
          head: ['Route', ...roles]
        });

        table.push(...rows);
        console.log(table.toString());

      } catch (e) {
        console.error(`Error in xc permissions.get`, e);
      }
    } else {


      try {

        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.get')
          return;
        }

        let [_, models] = args._;
        models = models.split('.');

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');


        // instantiate
        var table = new Table({
          head: ['Route', 'Role', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']

        });


        glob.sync(policiesPath).forEach((file) => {
          const modelName = path.basename(file).split('.')[0];

          if (models.includes(modelName)) {
            if (models.includes(modelName)) {
              let filePermissions = require(file).permissions;


              const roles = Object.values(filePermissions)
                .flatMap(
                  methods => Object.values(methods)
                    .flatMap(roles => Object.keys(roles))
                )
                .filter((v, i, arr) => arr.indexOf(v) === i);

              table.push([{colSpan: 7, content: colors.green(file), hAlign: 'center'}])

              for (let [route, methods] of Object.entries(filePermissions)) {
                let i = 0;
                for (let role of roles) {
                  {
                    table.push([...(i++ ? [] : [{rowSpan: roles.length, content: route, vAlign: 'center'}]), role,
                      methods.get && methods.get[role] ? colors.green('✔️') : colors.red('x'),
                      methods.post && methods.post[role] ? colors.green('✔️') : colors.red('x'),
                      methods.put && methods.put[role] ? colors.green('✔️') : colors.red('x'),
                      methods.delete && methods.delete[role] ? colors.green('✔️') : colors.red('x'),
                      methods.patch && methods.patch[role] ? colors.green('✔️') : colors.red('x'),
                    ])
                  }
                }
              }

            }

            // console.log(`Model : ${modelName} \n${JSON.stringify(filePermissions, 0, 2)} `)
          }
        })

        console.log(table.toString());


      } catch (e) {
        console.error(`Error in xc permissions.get`, e);
      }
    }
  }

  static async userAdd(args) {

    if (Util.isProjectGraphql()) {

      try {
        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, user] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;

          const roles = Object.values(filePermissions)
            .flatMap(roles => Object.keys(roles))
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (roles.includes(user)) {
            console.warn(`${user} already exist in ${modelName} policy`);
            return;
          }

          for (let roles of Object.values(filePermissions)) {
            roles[user] = true;
          }


          console.log(`Adding new role permission for model:${modelName} roles:${user}`);


          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.add`, e);
      }

    } else {

      try {
        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, user] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;

          const roles = Object.values(filePermissions)
            .flatMap(
              methods => Object.values(methods)
                .flatMap(roles => Object.keys(roles))
            )
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (roles.includes(user)) {
            console.warn(`${user} already exist in ${modelName} policy`);
            return;
          }

          for (let methods of Object.values(filePermissions)) {
            for (let roles of Object.values(methods)) {
              roles[user] = true;
            }
          }


          console.log(`Adding new role permission for model:${modelName} roles:${user}`);


          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.add`, e);
      }
    }


  }

  static async userDelete(args) {

    if (Util.isProjectGraphql()) {
      try {
        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, user] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;


          const roles = Object.values(filePermissions)
            .flatMap(roles => Object.keys(roles))
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (!roles.includes(user)) {
            console.warn(`${user} not exist in ${modelName} policy`);
            return;
          }

          for (let roles of Object.values(filePermissions)) {
            delete roles[user];
          }


          console.log(`Deleting user permission for model:${modelName} roles:${user}`);


          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.delete`, e);
      }
    } else {
      try {
        if (args._.length < 2) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, user] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;


          const roles = Object.values(filePermissions)
            .flatMap(
              methods => Object.values(methods)
                .flatMap(roles => Object.keys(roles))
            )
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (!roles.includes(user)) {
            console.warn(`${user} not exist in ${modelName} policy`);
            return;
          }

          for (let methods of Object.values(filePermissions)) {
            for (let roles of Object.values(methods)) {
              delete roles[user];
            }
          }


          console.log(`Deleting user permission for model:${modelName} roles:${user}`);


          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.delete`, e);
      }
    }
  }

  static async userRename(args) {

    if (Util.isProjectGraphql()) {
      try {
        if (args._.length < 3) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, oldUser, newUser] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;

          const roles = Object.values(filePermissions)
            .flatMap(roles => Object.keys(roles))
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (!roles.includes(oldUser)) {
            console.warn(`${oldUser} not exist in ${modelName} policy`);
            return;
          }
          if (roles.includes(newUser)) {
            console.warn(`${newUser} is already exist in ${modelName} policy`);
            return;
          }

          for (let roles of Object.values(filePermissions)) {
            roles[newUser] = roles[oldUser];
            delete roles[oldUser];
          }


          console.log(`Renaming user permission ${oldUser} to ${newUser} for model:${modelName}`);
          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.delete`, e);
      }
    } else {
      try {
        if (args._.length < 3) {
          console.warn('Invalid arguments for : xc permissions.userAdd')
          return;
        }

        let [_, oldUser, newUser] = args._;

        /* get all policies */
        let policiesPath = path.join(process.cwd(), 'server', PermissionsMgr.getPolicyPath(), '**', '*.policy.js');

        glob.sync(policiesPath).forEach((file) => {

          const modelName = path.basename(file).split('.')[0];


          let filePermissions = require(file).permissions;

          const roles = Object.values(filePermissions)
            .flatMap(
              methods => Object.values(methods)
                .flatMap(roles => Object.keys(roles))
            )
            .filter((v, i, arr) => arr.indexOf(v) === i);


          if (!roles.includes(oldUser)) {
            console.warn(`${oldUser} not exist in ${modelName} policy`);
            return;
          }
          if (roles.includes(newUser)) {
            console.warn(`${newUser} is already exist in ${modelName} policy`);
            return;
          }

          for (let methods of Object.values(filePermissions)) {
            for (let roles of Object.values(methods)) {
              roles[newUser] = roles[oldUser];
              delete roles[oldUser];
            }
          }


          console.log(`Renaming user permission ${oldUser} to ${newUser} for model:${modelName}`);
          let policyFileContent = `module.exports.permissions = ${JSON.stringify(filePermissions, 0, 2)};\n`;
          fs.writeFileSync(file, policyFileContent)

        });

      } catch (e) {
        console.error(`Error in xc permissions.user.delete`, e);
      }
    }
  }


  static getPolicyPath() {

    const projectConfig = jsonfile.readFileSync(path.join(process.cwd(), 'config.xc.json'));
    return projectConfig.meta.projectType === 'rest' ? 'routers' : 'resolvers';
  }
}


module.exports = PermissionsMgr;