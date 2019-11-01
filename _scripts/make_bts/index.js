var fs = require('fs');
var Vimeo = require('vimeo').Vimeo;
var moment = require('moment');
var util = require('util');
var slug = require('slug');

var CLIENT_ID="b26ea60915fb663983cab75ae8fbaf56c47ecff3";
var CLIENT_SECRET = "3fcJ4nTQ6kv67ee20+gkChAqR7WLy2UQ0MhyB1nQITV6RuWtlqwPMEOPZrqdLiXQZ2xqOSJRyNMa+xQKZtSUf3dduLuEwZyKOc8mO2XmRi9JA823eWe8uxGWjLSIiCDn";
var ACCESS_TOKEN = "fc6bd1f6c25471212050854e88b2d644";
var vimeo = new Vimeo(CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN);
var re = /src=\"([^"]*)\"/

const processVid = function(data) {
	var matches = re.exec(data.embed.html);
	if(!matches) {
		console.error("no player URL found for ", data.name)
		return;
	}
	var player_url = matches[1];
	
	// Get TAGS
	var tags = [];
	var bts = false;
	data.tags.forEach(function(tag){
		if(tag.name.toLowerCase() == "bts") 
			bts = true;
		else 
			tags.push( tag.name );
	});

	if(!bts) return;

	// Get POSTER IMAGE
	var poster = null;
	var thumbnail = null;
	if(data.pictures) {
		for(n in data.pictures.sizes) {
			if(data.pictures.sizes[n].width==960) 
				poster = data.pictures.sizes[n].link;

			if(data.pictures.sizes[n].width==295) 
				thumbnail = data.pictures.sizes[n].link;
		}
	}

	// Assemble FRONT MATTER
	var front_matter = [
		"---",
		"layout: default",
		"category: bts",
		util.format('tags: %s', JSON.stringify(tags)),
		util.format('video: "%s"', player_url),
		util.format('title: "%s"', data.name),
		util.format('thumbnail: "%s"', thumbnail),
	];

	if(data.description) {
		front_matter.push("description: | ");
		data.description.split("\n").forEach(function(line){
			front_matter.push("  "+line);
		});
	}

	front_matter.push("---")
	front_matter = front_matter.join("\n");


	// Generate FILENAME
	var date = moment(data.created_time);
	var filename = "../../_posts/bts/" + date.format("YYYY-MM-DD-") + slug(data.name) + ".md";

	console.log( filename );
	//console.log( front_matter );
	//console.log("================================== ")

	return new Promise((resolve, reject) => {
		fs.writeFile(filename, front_matter, {flags: 'w'}, err => {
			if (err) reject(err);
            resolve();
		});
	});
}


const parsePage = function(page) {
	return new Promise((resolve, reject) => {
		const path = `/users/jeffcrouse/videos?sort=date&per_page=100&page=${page}`;
		vimeo.request({'method': 'GET', "path": path}, function(error, body, status_code, headers){
			if(error) return reject(error);
			else {
				//console.log("found "+body.data.length+" results");
				var promises = body.data.map(async data => {
					return processVid(data);
				});

				Promise.all(promises).then(resolve);
			}
		});

	});
}

const makeBTS = async _ => {
	console.log("start");
	for(let page=1; page < 6; page++) {
		console.log("getting page "+page);
		await parsePage(page)
	}
	console.log("done");
}


makeBTS();

