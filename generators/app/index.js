'use strict';
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var semver = require('semver');
var XDMetadata = require('mozuxd-metadata');
var quickGitHits = require('quick-git-hits');
var SDK = require('mozu-node-sdk');

var helpers = require('../../utils/helpers');

var PROD_NAME = 'Production/Sandbox';
var PROD_HOMEPOD;
try {
  PROD_HOMEPOD = XDMetadata.environments[PROD_NAME].homeDomain;
} catch(e) {} // handled below

module.exports = yeoman.generators.Base.extend({

  _intro: 'Follow the prompts to scaffold a Mozu App package. The resulting directory will include package metadata and a sync tool.',

   // note: arguments and options should be defined in the constructor.
  constructor: function () {
    yeoman.generators.Base.apply(this, arguments);

    this.helpers = Object.keys(helpers).reduce(function(obj, name) {
      obj[name] = helpers[name].bind(this);
      return obj;
    }.bind(this), {});

    // This option adds support for non-production environments
    this.option('internal', {
      type: 'Boolean',
      defaults: false,
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
    if (!message) message = this._intro;
    if (this.options['skip-prompts']) {
      if (!this.config.get('domains')) {
        message = 'You cannot skip prompts if you have never run this generator in the current directory! Run again without the --skip-prompts or --quick options.';
        this.log(mosay(message));
        throw new Error(message);
      }
      message += '\n\nSkipping prompts step because --skip-prompts was specified. Rerunning...';
    }

    this.log(mosay(message));
  },


  promptForEnvironment: function(cb) {

    var self = this;
    if (!cb) cb = this.async();

    function done() {
      self.developerInfoKeys = [
        'AccountLogin',
        'AppKey',
        'SharedSecret'
      ].reduce(function(memo, keyName) {
        memo[keyName] = self._mozuEnv.name + '_' + keyName;
        return memo;
      }, {});
      cb();
    }

    if (this.options.internal) {

      helpers.promptAndSaveResponse(self, [{
        type: 'list',
        name: 'mozuEnv',
        message: 'Select Mozu environment:',
        default: this.config.get('homePod') || PROD_HOMEPOD,
        choices: Object.keys(XDMetadata.environments).map(function(envName) {
          return {
            name: envName,
            value: {
              name: envName,
              domain: XDMetadata.environments[envName].homeDomain
            }
          };
        })
      }], done);

    } else {

      if (!PROD_HOMEPOD) {
        throw new Error("Metadata package does not contain a home pod URL for `Production/Sandbox` environment.");
      }

      this._mozuEnv = {
        name: PROD_NAME,
        domain: PROD_HOMEPOD
      };

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
          var p = SDK.client(context)
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
                  message: 'Select a developer account for ' + chalk.bold.cyan(self._developerAccountLogin) + ':',
                  default: self.config.get('developerAccountId')
                }], done);
              }
            }, function(err) {
              if (err.originalError && err.originalError.errorCode === "INVALID_CREDENTIALS") {
                // terrible, awful, but can't figure out the lifecycle here and when.js is logging
                // a potential pending rejection which messes up the prompt
                SDK.suppressUnhandledRejections();
                helpers.lament(self, 'Invalid credentials. Retry password (or Ctrl-C to quit).')
                return getDeveloperAccountId();
              } else {
                helpers.lament(self, err.message);
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

    helpers.promptAndSaveResponse(this, [{
      type: 'confirm',
      name: 'createGit',
      message: 'Create Git repository?',
      filter: helpers.trimString,
      when: (function() {
        return this._gitInstalled && !this._inGitRepo && this.config.get('createGit') !== false;
      }.bind(this))
    }], done);

  },

  saveMozuConfig: function(extras) {
    if (!this.options['skip-prompts']) {
      this.fs.writeJSON(
        this.destinationPath('mozu.config.json'),
        helpers.merge(helpers.makeSDKContext(this), extras || {})
      );
      this.config.set('homePod', this._mozuEnv.domain || PROD_HOMEPOD);
      this.config.set('applicationKey', this._applicationKey);
      this.config.set('developerAccountId', this._developerAccountId);
      this.config.set('createGit', this._createGit);
    }
  },

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

});