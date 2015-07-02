'use strict';
var url = require('url');
var yeoman = require('yeoman-generator');
var chalk = require('chalk');
var mosay = require('mosay');
var XDMetadata = require('mozu-metadata');
var quickGitHits = require('quick-git-hits');
var semver = require('semver');
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

    this.option('developerAccountId', {
      desc: 'For testing',
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

    try {
      this._package = this.fs.readJSON(this.destinationPath('package.json'), {});
    } catch(e) {
      this._package = {};
    }

    try {
      this._mozuConfig = this.fs.readJSON(this.destinationPath('mozu.config.json'), {});
    } catch(e) {
      this._mozuConfig = {};
    }

    if (this.options.quick) {
      this.options['skip-install'] = this.options['skip-prompts'] = true;
    }
  },

  initializing: {
    notifyUpdates: function() {
      require('update-notifier')({ pkg: require('../../package.json'), updateCheckInterval: 1}).notify({ defer: false });
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

    promptForAppDetails: function(cb) {
      var done = this.async();

      var prompts = [{
        type: 'input',
        name: 'name',
        message: 'Name this Mozu Application (no spaces):',
        default: this._package.name || this.appname && this.appname.replace(/\s/g,'-'),
        filter: helpers.trimString,
        validate: function(name) {
          return !!name.match(/^[A-Za-z0-9\-_\.]+$/) || 'That may not be a legal npm package name.';
        }
      }, {
        type: 'input',
        name: 'description',
        message: 'Short description:',
        default: this._package.description || 'A Mozu Application containing Actions.'
      }, {
        type: 'input',
        name: 'version',
        message: 'Initial version:',
        default: this._package.version || '0.1.0',
        filter: helpers.trimString,
        validate: function(ver) {
          return !!semver.valid(ver) || 'Please supply a valid semantic version of the form major.minor.patch-annotation.\n\nExamples: 0.1.0, 3.21.103, 3.9.22-alt';
        }
      }, {
        type: 'input',
        name: 'applicationKey',
        message: 'Developer Center Application Key for this Application:',
        filter: helpers.trimString,
        default: this._mozuConfig.workingApplicationKey
      }];

      helpers.promptAndSaveResponse(this, prompts, done);

    },

    promptForEnvironment: function(cb) {

      var self = this;
      if (!cb) cb = this.async();

      var environmentNames = Object.keys(XDMetadata.environments);
      var currentMozuEnv = PROD_NAME;
      var currentHomepod = this._mozuConfig.baseUrl;
      if (currentHomepod) {
        currentHomepod = url.parse(currentHomepod).hostname;
        currentMozuEnv = environmentNames.reduce(function(m, x) {
          return (XDMetadata.environments[x].homeDomain === currentHomepod) ? x : m;
        }, null);
      }

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
          default: currentMozuEnv,
          choices: environmentNames
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
        var developerAccountId = self.options.developerAccountId || self._mozuConfig.developerAccountId;
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
                    default: self._mozuConfig.developerAccountId
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
                  helpers.lament(self, (err && (err.message || err.toString())) || "Unknown error! Please try again later.", err);
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
        }, {
          type: 'input',
          name: 'repositoryUrl',
          message: 'Repository Url (if available):'
        }], done);

      } else {
        done();
      } 

    }
  },

  configuring: {

    saveRc: function() {
      this.config.set('createGit', this._createGit);
    }

  },


  writing: {
    
    mozuConfig: function() {
      if (!this.options['skip-prompts']) {
        this.fs.writeJSON(
          this.destinationPath('mozu.config.json'),
          helpers.makeSDKContext(this)
        );
      }
    },

    packagejson: function() {

      var newPkg = {
        name: this._name,
        version: this._version,
        description: this._description
      };

      if (this._repositoryUrl) {
        newPkg.repository = {
          type: 'git',
          url: this._repositoryUrl
        };
      }

      this.fs.writeJSON(
        this.destinationPath('package.json'),
        helpers.merge(
          helpers.trimAll(newPkg),
          this._package
        )
      );
    }
  },

  install: {

    createRepoIfRequested: function(done) {
      if (!done) done = this.async();
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