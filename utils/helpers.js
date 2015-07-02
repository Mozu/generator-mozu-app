'use strict';

var merge = require('lodash.merge');
var chalk = require('chalk');
module.exports = {
  addAsPrivateProps: function(target, source) {
    Object.keys(source).forEach(function(key) {
      target['_' + key] = source[key];
    });
  },
  promptAndSaveResponse: function(generator, prompts, cb) {
    if (generator.options['skip-prompts']) {
      prompts.forEach(function(prompt) {
        generator['_' + prompt.name] = (typeof prompt.default === 'function') ? prompt.default() : prompt.default;
      });
      cb();
    } else {
      generator.prompt(prompts, function(answers) {
        Object.keys(answers).forEach(function(key) {
          generator['_' + key] = answers[key];
        });
        cb();
      });
    }
  },
  makeSDKContext: function(self) {
    return {
      appKey: self['_' + self.developerInfoKeys.AppKey],
      sharedSecret: self['_' + self.developerInfoKeys.SharedSecret],
      baseUrl: 'https://' + self._homePod,
      developerAccountId: self._developerAccountId,
      developerAccount: {
        emailAddress: self['_' + self.developerInfoKeys.AccountLogin]
      },
      workingApplicationKey: self._applicationKey
    };
  },
  trimString: function(str) {
    return str.trim();
  },
  trimAll: function(obj) {
    return Object.keys(obj).reduce(function(result, k) {
      result[k] = (typeof obj[k] === 'string') ? obj[k].trim() : obj[k];
      return result;
    }, {});
  },
  merge: merge,
  remark: function(ctx, str) {
    ctx.log(chalk.green('>> ') + str + '\n');
  },
  lament: function(ctx, str, e) {
    ctx.log(chalk.bold.red(str + '\n'));
    if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.indexOf('mozu-app') !== -1) {
      ctx.log(e && require('util').inspect(e, { depth: 4 }));
    }
  }
};