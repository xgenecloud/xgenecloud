const moment = require('moment');


exports.getUniqFilenamePrefix = function () {

  return moment().format('YYYYMMDD_HHmmss')

};

exports.getFilenameForUp = function (prefix) {

  return prefix + '.up.sql'

};

exports.getFilenameForDown = function (prefix) {

  return prefix + '.down.sql'

};
