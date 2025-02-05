<p align="center"><img src="https://raw.githubusercontent.com/impaxton/Helium/83457c85d164277a6ee053740821483d0ac66223/static/assets/icon.png" height="200"></p>

<h1 align="center">Helium</h1>

The deployable app for Helium, a highly sophisticated proxy used for evading internet censorship or accessing websites in a controlled sandbox using the power of service-workers and more!

## Deployment

[![Remix on Glitch](https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg)](https://glitch.com/edit/#!/import/github/impaxton/Helium)
[![Deploy to Koyeb](https://binbashbanana.github.io/deploy-buttons/buttons/remade/koyeb.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/impaxton/Helium&branch=main&name=Helium-App)

If you are deploying to an alternative service or to a server, refer below:

You must have Node LTS & NPM for this to work.
```
git clone https://github.com/impaxton/Helium.git/
cd Helium
npm i
npm start
```

> [!IMPORTANT]  
> Until deployed on a domain with a valid SSL certificate, Firefox will not be able to load the site. Use chromium for testing on localhost

### HTTP Transport
The example uses [EpoxyTransport](https://github.com/MercuryWorkshop/EpoxyTransport) to fetch proxied data encrypted.
