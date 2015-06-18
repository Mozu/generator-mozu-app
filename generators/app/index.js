'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var XDMetadata = require('mozu-metadata');
var quickGitHits = require('quick-git-hits');
var SDK = require('mozu-node-sdk');

var helpers = require('../../utils/helpers');

var PROD_NAME = 'Production/Sandbox';
var PROD_HOMEPOD;
try {
  PROD_HOMEPOD = XDMetadata.environments[PROD_NAME].homeDomain;
} catch(e) {} // handled below

module.exports = yeoman.generators.Base.extend({

  constructor: function () {
    yeoman.generators.Base.apply(this, arguments);

    // This option adds support for non-production environments
    this.option('internal', {
      type: 'Boolean',
      defaults: false,
      hide: true
    });

    this.option('intro', {
      defaults: 'Follow the prompts to scaffold a Mozu App package. The resulting directory will include package metadata and a sync tool.',
      hide: true
    });

    this.option('skip-prompts', {
      type: 'Boolean',
      desc: 'Skip prompts. Only use this option if you are re-running the generator!',
      defaults: false
    });

    this.option('skip-install', {
      type: Boolean,
      desc: 'Skip install step. You will have to run `npm install` manually.',
      defaults: false
    });

    this.option('quick', {
      type: 'Boolean',
      desc: 'Skip prompts step and install step. Reruns copy methods and that\'s it.',
      defaults: false
    });

    this.config.save();
    try {
      this._package = this.fs.readJSON(this.destinationPath('package.json'), {});
    } catch(e) {
      this._package = {};
    }
    if (this.options.quick) {
      this.options['skip-install'] = this.options['skip-prompts'] = true;
    }
  },

  initializing: {
    acquireGitStatus: function() {
      var done = this.async();
      quickGitHits.detectDirectory(this.destinationPath(), function(err, result) {
        if (err) {
          throw err;
        }
        helpers.addAsPrivateProps(this, result);
        done();
      }.bind(this));
    },
    displayMozuBanner: function(message) {
      if (!message) message = this.options.intro;
      if (this.options['skip-prompts']) {
        if (!this.fs.exists('mozu.config.json')) {
          message = 'You cannot skip prompts if you have never run this generator in the current directory! Run again without the --skip-prompts or --quick options.';
          this.log(mosay(message));
          throw new Error(message);
        }
        message += '\n\nSkipping prompts step because --skip-prompts was specified. Rerunning...';
      }

      this.log(mosay(message));
    }
  },

  prompting: {

    promptForEnvironment: function(cb) {

      var self = this;
      if (!cb) cb = this.async();

      function done() {
        self._homePod = XDMetadata.environments[self._mozuEnv].homeDomain;
        self.developerInfoKeys = [
          'AccountLogin',
          'AppKey',
          'SharedSecret'
        ].reduce(function(memo, keyName) {
          memo[keyName] = self._mozuEnv + '_' + keyName;
          return memo;
        }, {});
        cb();
      }

      if (this.options.internal) {

        helpers.promptAndSaveResponse(self, [{
          type: 'list',
          name: 'mozuEnv',
          message: 'Select Mozu environment:',
          default: this.config.get('mozuEnv') || PROD_NAME,
          choices: Object.keys(XDMetadata.environments)
        }], done);

      } else {
        if (!PROD_HOMEPOD) {
          throw new Error("Metadata package does not contain a home pod URL for `Production/Sandbox` environment.");
        }
        this._mozuEnv = PROD_NAME;
        done();
      }

    },

    promptForDeveloperAccount: function(cb) {

      var self = this;
      var done = cb || this.async();

      var prompts = [{
        type: 'input',
        name: this.developerInfoKeys.AccountLogin,
        message: 'Enter your Developer Account login email:',
        filter: helpers.trimString,
        store: true
      }, {
        type: 'input',
        name: this.developerInfoKeys.AppKey,
        message: 'Application Key for your developer sync app:',
        filter: helpers.trimString,
        store: true
      }, { 
        type: 'password',
        name: this.developerInfoKeys.SharedSecret,
        message: 'Shared Secret for your developer sync app:',
        filter: helpers.trimString,
        store: true
      }];

      helpers.promptAndSaveResponse(self, prompts, function getDeveloperAccountId() {
        var developerAccountId = self.config.get('developerAccountId');
        if (developerAccountId) {
          self._developerAccountId = developerAccountId;
          done();
        } else {
          helpers.promptAndSaveResponse(self, [{
            type: 'password',
            name: 'password', 
            message: 'Developer Account password:',
            validate: function(str) {
              return !!str;
            }
          }], function() {
            helpers.remark(self, 'Looking up developer accounts...');
            var context = helpers.makeSDKContext(self);
            context.developerAccount.password = self._password;
            var p = SDK.client(context, { plugins: [require('mozu-node-sdk/plugins/fiddler-proxy')] })
              .platform()
              .developer()
              .developerAdminUserAuthTicket()
              .createDeveloperUserAuthTicket(context.developerAccount).then(function(res) {
                if (!res.availableAccounts) {
                  helpers.lament(self, "No available accounts found for " + context.developerAccount.emailAddress);
                } else {
                  var accountChoices = res.availableAccounts.map(function(acct) {
                    return {
                      name: acct.name + ' (' + acct.id + ')',
                      value: acct.id
                    };
                  });

                  helpers.promptAndSaveResponse(self, [{
                    type: 'list',
                    name: 'developerAccountId',
                    choices: accountChoices,
                    message: 'Select a developer account for ' + chalk.bold.cyan(self['_' + self.developerInfoKeys.AccountLogin]) + ':',
                    default: self.config.get('developerAccountId')
                  }], done);
                }
              }, function(err) {
                if (err && err.originalError && err.originalError.errorCode === "INVALID_CREDENTIALS") {
                  // terrible, awful, but can't figure out the lifecycle here and when.js is logging
                  // a potential pending rejection which messes up the prompt
                  SDK.suppressUnhandledRejections();
                  helpers.lament(self, 'Invalid credentials. Retry password (or Ctrl-C to quit).')
                  return getDeveloperAccountId();
                } else {
                  helpers.lament(self, (err && (err.message || err.toString())) || "Unknown error! Please try again later.");
                  process.exit(1);
                }
              });
          });
        }
        return true;
      });

    },

    promptForGitRepo: function(done) {

      done = done || this.async();

      if (this._gitInstalled && !this._inGitRepo && this.config.get('createGit') !== false) {

        helpers.promptAndSaveResponse(this, [{
          type: 'confirm',
          name: 'createGit',
          message: 'Create Git repository?',
          filter: helpers.trimString
        }], done);

      } else {
        done();
      } 

    }
  },

  configuring: {

    saveMozuConfig: function() {
      if (!this.options['skip-prompts']) {
        this.fs.writeJSON(
          this.destinationPath('mozu.config.json'),
          helpers.makeSDKContext(this)
        );
        this.config.set('mozuEnv', this._mozuEnv);
        this.config.set('developerAccountId', this._developerAccountId);
        this.config.set('createGit', this._createGit);
      }
    }

  },

  installing: {

    createRepoIfRequested: function(done) {
      if (!done) done = this.async();
      console.log('got here');
      if (this._createGit) {
        quickGitHits.createRepoInDirectory(this.destinationPath(), { repositoryUrl: this._repositoryUrl }, function(err) {
          if (err) {
            throw err;
          }
          helpers.remark(this, 'Created git repository');
          if (this._repositoryUrl) {
            helpers.remark(this, 'Added remote ' + this._repositoryUrl + ' to git repository');
          }
          done();
        }.bind(this));
      } else {
        done();
      }
    }

  }

}, {
  helpers: helpers
});