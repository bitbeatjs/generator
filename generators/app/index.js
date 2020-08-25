const Generator = require('yeoman-generator');
const { mkdirSync, readdirSync } = require('fs');
const beautify = require('js-beautify').js;

module.exports = class extends Generator {
  async prompting() {
    try {
      this.answers = await this.prompt([
        {
          type: 'input',
          name: 'packageManager',
          message: 'Using npm or yarn?',
          default: 'npm' // Default to npm
        },
        {
          type: 'input',
          name: 'name',
          message: 'Your project name',
          default: this.appname // Default to current folder name
        },
        {
          type: 'input',
          name: 'version',
          message: 'Your project version',
          default: '1.0.0' // Default to current project version
        },
        {
          type: 'input',
          name: 'description',
          message: 'Your project description',
          default: '' // Default to current project description
        },
        {
          type: 'confirm',
          name: 'typescript',
          message: 'Do you want to use typescript? (recommended)',
          default: true,
        },
        {
          type: 'confirm',
          name: 'placeholderDirectories',
          message: 'Do you want to generate empty directories? (optional)',
          default: false,
        },
        {
          type: 'confirm',
          name: 'webServer',
          message: 'Would you like to generate a web server?',
          default: false,
        },
        {
          type: 'confirm',
          name: 'webSocketServer',
          message: 'Would you like to generate a websocket server?',
          default: false,
        },
      ]);

      if (this.answers.webSocketServer) {
        if (this.answers.webServer) {
          Object.assign(this.answers, await this.prompt([
            {
              type: 'confirm',
              name: 'webSocketServerUnify',
              message: 'Would you like to run the websocket server on the web server port?'
            }
          ]));
        }
      }

      if (this.answers.webServer) {
        Object.assign(this.answers, await this.prompt([
          {
            type: 'confirm',
            name: 'statusAction',
            message: 'Would you like to add a status action for the servers?'
          }
        ]));

        Object.assign(this.answers, await this.prompt([
          {
            type: 'confirm',
            name: 'documentationAction',
            message: 'Would you like to add a documentation action for the servers?'
          }
        ]));
      }
    } catch (e) {
      throw e;
    }
  }

  _createDirectoryIfNotExist(directory) {
    try {
      readdirSync(directory);
      this.log(`Skipped creation of ${directory}...`);
    } catch (e) {
      mkdirSync(directory);
    }
  }

  _generateFolders() {
    this.log('Generating structure...');
    ['actions', 'config', 'connections', 'initializers', 'middlewares', 'servers', 'tasks', 'public', 'log', 'utils'].forEach((dir) => {
      this._createDirectoryIfNotExist(dir);
    });
  }

  writing() {
    let pkgJson = {
      name: this.answers.name,
      version: this.answers.version,
      description: this.answers.description,
      scripts: {
        start: 'node ./node_modules/@bitbeat/core/bin/index.js'
      },
      author: this.author,
      license: 'MIT',
      dependencies: {
        '@bitbeat/core': '^0.0.1'
      },
      devDependencies: {
        'eslint': '^6.8.0',
        'lint-staged': '^10.0.7',
        'prettier': '1.19.1',
      },
    };

    if (this.answers.placeholderDirectories) {
      this._generateFolders();
    }

    if (this.answers.webServer) {
      Object.assign(pkgJson.dependencies, {
        '@bitbeat/web': '^0.0.1',
      });
    }

    if (this.answers.webSocketServer) {
      Object.assign(pkgJson.dependencies, {
        '@bitbeat/websocket': '^0.0.1',
      });
    }

    if (this.answers.typescript) {
      this.log('Generating typescript assets and configs...');

      Object.assign(pkgJson.scripts, {
        build: 'npx tsc',
        watch: 'npx tsc --watch',
      });

      Object.assign(pkgJson.devDependencies, {
        '@types/debug': '^4.1.5',
        '@types/ioredis': '^4.17.3',
        '@types/node': '^13.7.0',
        '@types/node-cron': '^2.0.3',
        '@types/pino': '^6.3.0',
        '@typescript-eslint/eslint-plugin': '^2.24.0',
        '@typescript-eslint/parser': '^2.24.0',
        'typescript': '^3.8.3',
      });

      this.fs.copyTpl(
        this.templatePath('.eslintrc.js'),
        this.destinationPath('.eslintrc.js')
      );

      this.fs.copyTpl(
          this.templatePath('tsconfig.json'),
          this.destinationPath('tsconfig.json')
      );
    }

    this.fs.extendJSON(this.destinationPath('package.json'), pkgJson);

    if (this.answers.webServer || this.answers.webSocketServer) {
      const typeScriptBootLines = [];
      const jsBootLines = [];

      if (this.answers.typescript) {
        typeScriptBootLines.push(`import { registerBulk } from '@bitbeat/core';`);
      } else {
        jsBootLines.push(`const { registerBulk } =  require('@bitbeat/core');`);
      }

      if (this.answers.webServer) {
        const webServerImports = ['WebServer', 'WebServerConfig'];

        if (this.answers.statusAction) {
          webServerImports.push('Status');
        }

        if (this.answers.documentationAction) {
          webServerImports.push('Documentation');
        }

        if (this.answers.typescript) {
          typeScriptBootLines.push(`import { ${webServerImports.join(', ')} } from '@bitbeat/web';`);
        } else {
          jsBootLines.push(`const { ${webServerImports.join(', ')} } = require('@bitbeat/web');`);
        }
      }

      if (this.answers.webSocketServer) {
        const webSocketServerImports = ['WebSocketServer', 'WebSocketServerConfig'];

        if (this.answers.typescript) {
          typeScriptBootLines.push(`import { ${webSocketServerImports.join(', ')} } from '@bitbeat/websocket';`);
        } else {
          jsBootLines.push(`const { ${webSocketServerImports.join(', ')} } = require('@bitbeat/websocket');`);
        }
      }

      const startUpAction = [];

      if (this.answers.typescript) {
        startUpAction.push('export default async () => {');
      } else {
        startUpAction.push('module.exports = async () => {');
      }

      if (this.answers.webSocketServerUnify) {
        startUpAction.push(`
        const webServer = new WebServer();

        // attach the websocket to the web server
        webServer.postRegister = () => {
            const webSocketServerConfig = getInstance(WebSocketServerConfig);
    
            if (!webSocketServerConfig) {
                throw new Error('Could not find websocket config.');
            }
    
            webSocketServerConfig.default = {
                server: webServer.runtime?.server,
            };
        };
        `);
      }

      const registers = [];

      if (this.answers.webServer) {
        registers.push(`{
            instance: WebServerConfig,
            createInstance: true,
          }`);

        if (this.answers.webSocketServerUnify) {
          registers.push(`{
            instance: webServer,
          }`);
        } else {
          registers.push(`{
            instance: WebServer,
            createInstance: true,
          }`);
        }
      }

      if (this.answers.webSocketServer) {
        registers.push(`{
          instance: WebSocketServerConfig,
          createInstance: true,
        }`);
        registers.push(`{
          instance: WebSocketServer,
          createInstance: true,
        }`);
      }

      if (this.answers.statusAction) {
        registers.push(`{
          instance: Status,
          createInstance: true,
        }`);
      }

      if (this.answers.documentationAction) {
        registers.push(`{
          instance: Documentation,
          createInstance: true,
        }`);
      }

      startUpAction.push(`
        await registerBulk(
          new Set([${registers.join(',\n')}])
        );
      `);
      startUpAction.push(`};`);

      if (this.answers.typescript) {
        typeScriptBootLines.push(startUpAction.join('\n'));
        this.fs.write(
            this.destinationPath('boot.ts'),
            beautify(typeScriptBootLines.join('\n'), {
              indent_size: 2,
              space_in_empty_paren: true
            })
        );
      } else {
        jsBootLines.push(startUpAction.join('\n'));
        this.fs.write(
            this.destinationPath('boot.js'),
            beautify(jsBootLines.join('\n'), {
              indent_size: 2,
              space_in_empty_paren: true
            })
        );
      }
    }
  }

  installRootFramework() {
    switch (this.answers.packageManager.toLowerCase()) {
      case 'npm':
        this.npmInstall();
        break;
      case 'yarn':
        this.yarnInstall();
        break;
      default:
        this.npmInstall();
    }
  }
};
