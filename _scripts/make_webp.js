const path = require('path');
const webp = require('webp-converter');
const fg = require('fast-glob');

(async () => {
	var dir = path.resolve(__dirname, "..", "images").replace(/\\/g, '/');
    dir = fg.escapePath(dir);
    const pattern = `${dir}/**/*.{jpg,jpeg,png,gif}`;

    const images = await fg(pattern,  { caseSensitiveMatch: false });
    for(var i=0; i<images.length; i++) {

        var convert = webp.cwebp;
        if(images[i].endsWith("gif"))
            convert = webp.gwebp;
        const outfile = images[i]+".webp";
        console.log(`${i}/${images.length}`, images[i], images[i]+".webp");
        await convert(images[i], outfile, "-q 80", logging="-v");
    }
})();

