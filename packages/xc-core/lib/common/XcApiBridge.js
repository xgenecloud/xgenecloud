const jsonfile = require('jsonfile');
const path = require('path');
const mkdirp = require("mkdirp");
let rootDir = null;
const promisify = require('util').promisify;

class XcApiBridge {

  constructor({dir}) {
    this.dir = dir;
    rootDir = dir;
  }

  async getApiCollectionFromExpress(app) {

    let currentApis = [];

    for (let i = 0; i < app._router.stack.length; ++i) {
      let r = app._router.stack[i];
      let api = {};
      if (r.route && r.route.path) {
        //console.log(r.route.path, r.route.methods);
        api.id = i + 1;
        api.isLeaf = true;
        api.label = r.route;
        api.name = r.route;
        api.pid = 0;
        api.type = 0;
        api.url = `http://localhost:3000` + r.route;
        api.body = "";
        api.params = [{
          "name": "",
          "value": "",
          "enabled": true
        }];
        api.auth = "";
        api.headers = [];
        api.response = {};
      }
      currentApis.push(api);
    }

    //console.log(currentApis);

  }

  // {
  //   "id": 77,
  //   "isLeaf": true,
  //   "label": "/api/v1/user/picture",
  //   "name": "/api/v1/user/picture",
  //   "pid": 1575123375164,
  //   "type": "POST",
  //   "url": "https://localhost:8080/api/v1/user/picture",
  //   "body": "",
  //   "params": [
  //     {
  //       "name": "",
  //       "value": "",
  //       "enabled": true
  //     }
  //   ],
  //   "auth": "",
  //   "headers": [],
  //   "response": {}
  // },

  getApis(app) {

    let currentApis = [];

    for (let i = 0; i < app._router.stack.length; ++i) {
      let r = app._router.stack[i];
      let api = {};
      if (r.route && r.route.path) {
        //console.log(r.route.path, r.route.methods);
        api.id = i + 1;
        api.isLeaf = true;
        api.label = r.route.path;
        api.name = r.route.path;
        api.pid = 0;
        api.type = Object.keys(r.route.methods)[0].toUpperCase();
        api.url = `http://localhost:3000` + r.route.path;
        api.body = "";
        api.params = [{
          "name": "",
          "value": "",
          "enabled": true
        }];
        api.auth = "";
        api.headers = [];
        api.response = {};

        currentApis.push(api);
      }

    }

    currentApis.sort(function (a, b) {
      return a.url.localeCompare(b.url);
    })

    let p = path.join(process.cwd(), 'server', 'tool', 'apis', 'all.apis.json');
    jsonfile.writeFileSync(p, currentApis, {space: 2})

    //console.log(currentApis);

  }

  async record(req, res, next) {

    let oldWrite = res.write,
      oldEnd = res.send;

    let chunks = [];

    res.write = function (chunk) {
      chunks.push(chunk);

      oldWrite.apply(res, arguments);
    };

    let body = '';

    res.send = async function (chunk) {

      body = chunk;
      oldEnd.apply(res, arguments);

    };

    res.on('finish', async function (chunk) {
      let api = {};
      if (body) {
        api.id = Date.now();
        api.isLeaf = true;
        api.label = req.path;
        api.name = req.path;
        api.pid = 0;
        api.type = req.method.toUpperCase();
        api.url = `${req.protocol}://${req.get('host')}` + req.path;
        api.body = JSON.stringify(req.body);
        api.params = _getApiParamsFromExpressRequest(req.params);
        api.auth = "";
        api.headers = _getApiReqHeadersFromExpressRequest(req.headers);
        api.response = body;
        await promisify(mkdirp)(path.join(process.cwd(), 'server', 'tool', 'apis', 'recorded'));
        let p = path.join(process.cwd(), 'server', 'tool', 'apis', 'recorded', 'recorded.apis.json');
        let file = [];
        try {
          file = jsonfile.readFileSync(p);
        } catch (e) {
          file = [];
        }
        file.unshift(api);
        jsonfile.writeFileSync(p, file, {spaces: 2});
      }
    });

    next();
  }

  finish() {

  }

}


function _getApiParamsFromExpressRequest(params) {
  let arr = [];

  for (let p in params) {
    let param = {};
    param.name = p;
    param.value = params[p];
    param.enabled = true;
    arr.push(param);
  }

  return arr;
}

function _getApiReqHeadersFromExpressRequest(headers) {
  let arr = [];

  for (let p in headers) {
    let header = {};
    header.name = p;
    header.value = headers[p];
    header.enabled = true;
    arr.push(header);
  }

  return arr;
}

module.exports = XcApiBridge;