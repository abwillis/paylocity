
// forge.config.js
const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    // Optional: if you have build/icon.ico, set the base icon name (no extension)
    icon: path.join(__dirname, 'build', 'icon'),
  },
  rebuildConfig: {},

  makers: [
    // ✅ MSIX maker (correctly wrapped with name + config)
    {
      name: '@electron-forge/maker-msix',
      config: {
        logLevel: 'debug',
        manifestVariables: {
          publisher: 'CN=Andy Willis, OU=Information Technology, OU=Users, OU=Texarkana, DC=ledwell, DC=com',
          identityName: 'PaylocityWrapper',
          packageDisplayName: 'Paylocity Wrapper',
          packageDescription: 'Electron app that opens Paylocity',
        },
        // Signing with your PFX — comment this block out if you want auto dev-cert instead
        windowsSignOptions: {
          certificateFile: 'C:\\apps\\certs\\my_code_sign.pfx',
          certificatePassword: 'ChangeMeBetter',
        },
      },
    },

    // --- Keep or remove makers below depending on what outputs you want ---

    // Squirrel EXE (produces Setup.exe + .nupkg)
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        // name: 'Paylocity_Wrapper' // optional
      },
    },

    // macOS ZIP
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },

    // Linux DEB
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },

    // Linux RPM
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
``
