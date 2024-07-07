'use strict';

import chalk from 'chalk';
import util from 'util';

const helpers = {
  addAsPrivateProps(target, source) {
    Object.keys(source).forEach(key => {
      target[`_${key}`] = source[key];
    });
  },

  promptAndSaveResponse(generator, prompts, cb) {
    if (generator.options['skip-prompts']) {
      prompts.forEach(prompt => {
        generator[`_${prompt.name}`] = typeof prompt.default === 'function' ? prompt.default() : prompt.default;
      });
      cb();
    } else {
      generator.prompt(prompts).then(answers => {
        Object.keys(answers).forEach(key => {
          generator[`_${key}`] = answers[key];
        });
        cb();
      });
    }
  },

  makeSDKContext(self) {
    return {
      appKey: self[`_${self.developerInfoKeys.AppKey}`],
      sharedSecret: self[`_${self.developerInfoKeys.SharedSecret}`],
      baseUrl: process.env.MOZU_HOMEPOD || self._homePod,
      developerAccountId: self._developerAccountId,
      developerAccount: {
        emailAddress: self[`_${self.developerInfoKeys.AccountLogin}`]
      },
      workingApplicationKey: self._applicationKey
    };
  },

  trimString(str) {
    return str.trim();
  },

  trimAll(obj) {
    return Object.keys(obj).reduce((result, k) => {
      result[k] = typeof obj[k] === 'string' ? obj[k].trim() : obj[k];
      return result;
    }, {});
  },

  merge(...args) {
    return Object.assign(...args);
  },

  remark(ctx, str) {
    ctx.log(chalk.green('>> ') + str + '\n');
  },

  lament(ctx, str, e) {
    ctx.log(chalk.bold.red(`${str}\n`));
    if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.includes('mozu-app')) {
      ctx.log(e && chalk.bold.red(`Details: \n${util.inspect(e, { depth: 4 })}`));
    }
  }
};

export default helpers;
