'use strict';

import path from 'path';
import url from 'url';
import Generator from 'yeoman-generator';
import chalk from 'chalk';
import mosay from 'mozu-say';
import XDMetadata from 'mozu-metadata';
import quickGitHits from 'quick-git-hits';
import semver from 'semver';
import SDK from 'mozu-node-sdk';
import { fileURLToPath } from 'url';
import notifier  from 'update-notifier';
import helpers from '../../utils/helpers.js';
import fiddlerProxy from 'mozu-node-sdk/plugins/fiddler-proxy.js';
import GruntfileEditor from 'gruntfile-editor';
import fs from 'fs';


const PROD_NAME = 'Production/Sandbox';
let PROD_HOMEPOD;
try {
  PROD_HOMEPOD = XDMetadata.environments[PROD_NAME].homeDomain;
} catch (e) { } // handled below

const __dirname = path.dirname(fileURLToPath(import.meta.url));


export default class extends Generator {

  constructor(args, opts) {
    super(args, opts);

    this.option('internal', {
      type: Boolean,
      defaults: false,
      hide: true
    });

    this.option('intro', {
      defaults: 'Follow the prompts to scaffold a Mozu Application package. When you\'re done, this directory will include package metadata and an API configuration for uploading your app.',
      hide: true
    });

    this.option('developerAccountId', {
      desc: 'For testing',
      hide: true
    });

    this.option('skip-prompts', {
      type: Boolean,
      desc: 'Skip prompts. Only use this option if you are re-running the generator!',
      defaults: false
    });

    this.option('skip-install', {
      type: Boolean,
      desc: 'Skip install step. You will have to run `npm install` manually.',
      defaults: false
    });

    this.option('quick', {
      type: Boolean,
      desc: 'Skip prompts step and install step. Reruns copy methods and that\'s it.',
      defaults: false
    });

    this.option('config', {
      type: Boolean,
      alias: 'c',
      desc: 'Only create a mozu.config.json file. Use this option for configuring existing projects to work with your own developer account.'
    });

    this.option('composed', {
      hide: true,
      desc: 'Flag to prevent running the same setup twice',
      type: Boolean
    });

    this.option('package-name', {
      desc: 'Flag for generators composing this one to pass a default package name',
      hide: true
    });

    this.option('package-description', {
      desc: 'Flag for generators composing this one to pass a default package description',
      hide: true
    });

    try {
      this._package = this.fs.readJSON(this.destinationPath('package.json'), {});
    } catch (e) {
      this._package = {};
    }

    try {
      this._mozuConfig = this.fs.readJSON(this.destinationPath('mozu.config.json'), {});
    } catch (e) {
      this._mozuConfig = {};
    }

    if (this.options.quick) {
      this.options['skip-install'] = this.options['skip-prompts'] = true;
    }
  }

  async initializing() {
    this._notifyUpdates();
    await this._acquireGitStatus();
    this._displayMozuBanner();
  }

  _notifyUpdates() {
    let packageJsonPath  = path.resolve(__dirname, '../../package.json')
    const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    notifier({ pkg: packageJsonContent, updateCheckInterval: 1 }).notify({ defer: false });
  }

  _acquireGitStatus() {
    return new Promise(resolve => {
      quickGitHits.detectDirectory(this.destinationPath(), (err, result) => {
        if (err) {
          throw err;
        }
        helpers.addAsPrivateProps(this, result);
        resolve();
      });
    });
    
  }

  _displayMozuBanner(message = this.options.intro) {
    if (!this.options.composed) {
      if (this.options.config) {
        message = "Follow the prompts to configure this project to connect to the Mozu APIs.";
      } else if (this.options['skip-prompts']) {
        if (!this.fs.exists('mozu.config.json')) {
          message = 'You cannot skip prompts if you have never run this generator in the current directory! Run again without the --skip-prompts or --quick options.';
          this.log(mosay(message));
          throw new Error(message);
        }
        message += '\n\nSkipping prompts step because --skip-prompts was specified. Rerunning...';
      }
      this.log(mosay(message));
    }
  }

  async prompting() {
    await this._promptForAppDetails();
    await this._promptForEnvironment();
    await this._promptForDeveloperAccount();
    await this._promptForGitRepo();
  }

  _promptForAppDetails() {
    return new Promise(resolve => {
      const packagePrompts = [{
        type: 'input',
        name: 'name',
        message: 'Application package name (letters, numbers, dashes):',
        default: this._package.name || this.appname && this.appname.replace(/\s/g, '-'),
        filter: helpers.trimString,
        validate: name => !!name.match(/^[A-Za-z0-9\-_\.]+$/) || 'That may not be a legal npm package name.',
        when: () => !this.options['package-name']
      }, {
        type: 'input',
        name: 'description',
        message: 'Short description:',
        default: this._package.description || '',
        when: () => !this.options['package-description']
      }, {
        type: 'input',
        name: 'version',
        message: 'Initial version:',
        default: this._package.version || '0.1.0',
        filter: helpers.trimString,
        validate: ver => !!semver.valid(ver) || 'Please supply a valid semantic version of the form major.minor.patch-annotation.\n\nExamples: 0.1.0, 3.21.103, 3.9.22-alt'
      }];

      const configPrompts = [{
        type: 'input',
        name: 'applicationKey',
        message: 'Developer Center Application Key for this Application:',
        filter: helpers.trimString,
        default: this._mozuConfig.workingApplicationKey
      }];

      const prompts = this.options.config ? configPrompts : packagePrompts.concat(configPrompts);

      helpers.promptAndSaveResponse(this, prompts, () => {
        this._description = this._description || this.options['package-description'];
        this._name = this._name || this.options['package-name'];
        resolve();
      });
    });
  }

  _promptForEnvironment() {
    return new Promise(resolve => {
      const environmentNames = Object.keys(XDMetadata.environments);
      let currentMozuEnv = PROD_NAME;
      let currentHomepod = this._mozuConfig.baseUrl;

      if (currentHomepod) {
        currentHomepod = url.parse(currentHomepod).hostname;
        currentMozuEnv = environmentNames.reduce((m, x) => XDMetadata.environments[x].homeDomain === currentHomepod ? x : m, null);
      }

      const done = () => {
        this._homePod = XDMetadata.environments[this._mozuEnv].homeDomain;
        this.developerInfoKeys = ['AccountLogin'].reduce((memo, keyName) => {
          memo[keyName] = `${this._mozuEnv}_${keyName}`;
          return memo;
        }, {});
        resolve();
      };

      if (this.options.internal) {
        helpers.promptAndSaveResponse(this, [{
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
    });
  }

  _promptForDeveloperAccount() {
    return new Promise(resolve => {
      const prompts = [{
        type: 'input',
        name: this.developerInfoKeys.AccountLogin,
        message: 'Enter your Developer Account login email:',
        filter: helpers.trimString,
        store: true
      }];

      helpers.promptAndSaveResponse(this, prompts, () => this._getDeveloperAccountId(resolve));
    });
  }

  _getDeveloperAccountId(done) {
    const developerAccountId = this.options.developerAccountId || this._mozuConfig.developerAccountId;
    const oldHomepod = this._mozuConfig.baseUrl;
    const newHomepod = this._homePod;
    const oldAccountEmail = this._mozuConfig.developerAccount && this._mozuConfig.developerAccount.emailAddress && this._mozuConfig.developerAccount.emailAddress.trim();
    const newAccountEmail = this[`_${this.developerInfoKeys.AccountLogin}`].trim();

    if (developerAccountId && oldHomepod === newHomepod && oldAccountEmail === newAccountEmail) {
      this._developerAccountId = developerAccountId;
      done();
    } else {
      helpers.promptAndSaveResponse(this, [{
        type: 'password',
        name: 'password',
        message: 'Developer Account password:',
        validate: str => !!str
      }], () => this._lookupDeveloperAccount(done));
    }
  }

  _lookupDeveloperAccount(done) {
    helpers.remark(this, 'Looking up developer accounts...');
    const context = helpers.makeSDKContext(this);
    context.developerAccount.password = this._password;
    delete context.developerAccountId;

    SDK.client(context, { plugins: [fiddlerProxy] })
      .platform()
      .developer()
      .developerAdminUserAuthTicket()
      .createDeveloperUserAuthTicket(context.developerAccount, { scope: 'NONE' })
      .then(res => this._handleDeveloperAccounts(res, done))
      .catch(err => this._handleDeveloperAccountError(err, done));
  }

  _handleDeveloperAccounts(res, done) {
    if (!res.availableAccounts) {
      helpers.lament(this, `No available accounts found for ${context.developerAccount.emailAddress}`);
    } else {
      const accountChoices = res.availableAccounts.map(acct => ({ name: `${acct.name} (${acct.id})`, value: acct.id }));
      helpers.promptAndSaveResponse(this, [{
        type: 'list',
        name: 'developerAccountId',
        choices: accountChoices,
        message: `Select a developer account for ${chalk.bold.cyan(this[`_${this.developerInfoKeys.AccountLogin}`])}:`,
        default: this._mozuConfig.developerAccountId
      }], done);
    }
  }

  _handleDeveloperAccountError(err, done) {
    if (err && err.originalError && err.originalError.errorCode === "INVALID_CREDENTIALS") {
      SDK.suppressUnhandledRejections();
      helpers.lament(this, 'Invalid credentials. Retry password (or Ctrl-C to quit).', err.originalError);
      this._getDeveloperAccountId(done);
    } else {
      helpers.lament(this, `Sorry, there was an error: ${err && (err.message || err.toString()) || "Unknown error! Please try again later."}`, err);
      process.exit(1);
    }
  }

  _promptForGitRepo() {
    return new Promise(resolve => {
      if (!this.options.config && this._gitInstalled && !this._inGitRepo && this.config.get('createGit') !== false) {
        helpers.promptAndSaveResponse(this, [{
          type: 'confirm',
          name: 'createGit',
          message: 'Create Git repository?',
          filter: helpers.trimString
        }, {
          type: 'input',
          name: 'repositoryUrl',
          message: 'Repository Url (if available):'
        }], resolve);
      } else {
        resolve();
      }
    });
  }

  configuring() {
    this._saveRc();
    this._mozuConfigFn();
    this._packagejson();
  }

  _saveRc() {
    if (!this.options.config) {
      this.config.set('createGit', this._createGit);
    }
  }

  _mozuConfigFn() {
    if (!this.options['skip-prompts']) {
      this.fs.writeJSON(this.destinationPath('mozu.config.json'), helpers.makeSDKContext(this));
    }
  }

  _packagejson() {
    if (this.options.config) return;

    const newPkg = {
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

    this.fs.writeJSON(this.destinationPath('package.json'), helpers.merge(
      helpers.trimAll(newPkg),
      this._package,
      this.fs.readJSON(this.destinationPath('package.json'), this._package)
    ));
  }

  install() {
    this._createRepoIfRequested();
  }

  _createRepoIfRequested() {
    const done = this.async();
    if (!this.options.config && this._createGit) {
      quickGitHits.createRepoInDirectory(this.destinationPath(), { repositoryUrl: this._repositoryUrl }, err => {
        if (err) {
          throw err;
        }
        helpers.remark(this, 'Created git repository');
        if (this._repositoryUrl) {
          helpers.remark(this, `Added remote ${this._repositoryUrl} to git repository`);
        }
        done();
      });
    } else {
      done();
    }
  }

  // Getter for myProperty
  get gruntfile() {
    if (!this.env.gruntfile) {
      var gruntfile = '';
      var gruntPath = this.destinationPath('Gruntfile.js');

      if (this.fs.exists(gruntPath)) {
        gruntfile = this.fs.read(gruntPath);
      }

      this.env.gruntfile = new GruntfileEditor(gruntfile);
    }

    // Schedule the creation/update of the Gruntfile
    this.env.runLoop.add('writing', function (done) {
      this.fs.write(
        this.destinationPath('Gruntfile.js'),
        this.env.gruntfile.toString()
      );
      done();
    }.bind(this), { once: 'gruntfile:write' });

    return this.env.gruntfile;
  }

 
}
