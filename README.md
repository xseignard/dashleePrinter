## Udev rules

- With one usb cable try all the usb ports needed and note the `KERNELS` number.
```
udevadm info -a -p /sys/bus/usb-serial/devices/ttyUSB1 | grep KERNEL | sed -n -e 1p -e 3p
```
should return :
```
KERNEL=="ttyUSB1"
KERNELS=="2-6.4"
```
- Map each `KERNELS` number to a symlink in the udev rules file.

- Copy udev file `sudo cp 99-dashleePrinter.rules /etc/udev/rules.d/`

## Install the fonts

Install `ttf` fonts found on the fonts folder.

## Install non node dependencies

Install graphicsmagick: `sudo apt-get install graphicsmagick`

## Install node dependencies

`npm install`

## Plug the printers according to the schema
Back of the Zotac ZBox computer:
![usb plug schema](/images/printers.png)

## Run it

`node main.js`
