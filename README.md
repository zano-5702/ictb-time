# ictb-time

git clone https://github.com/zano-5702/ictb-time.git

Falls ordner schon existiert sudo rm -r ictb-Time-tracking Falls ordner schon existiert sudo rm -r ictb-time-tracking
sudo rm -r ictb-time

#Installation Adapter und Puppeteer-Core #cd /opt/iobroker/ictb-time #npm install puppeteer-core

cd /opt/iobroker 
npm install /opt/iobroker/ictb-time 
iobroker add ictb-time
iobroker upload ictb-time
iobroker restart ictb-time

systemvorbereitung für das erstellen der pdf


Test Scripte ausführen: 
cd /opt/iobroker/ictb-time
node test_full.js
node test_admin_full.js 
