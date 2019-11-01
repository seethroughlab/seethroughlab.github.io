var fs = require('fs');
var Vimeo = require('vimeo').Vimeo;
var moment = require('moment');
var util = require('util');
var slug = require('slug');
var Handlebars = require('handlebars');

var CLIENT_ID="b26ea60915fb663983cab75ae8fbaf56c47ecff3";
var CLIENT_SECRET = "3fcJ4nTQ6kv67ee20+gkChAqR7WLy2UQ0MhyB1nQITV6RuWtlqwPMEOPZrqdLiXQZ2xqOSJRyNMa+xQKZtSUf3dduLuEwZyKOc8mO2XmRi9JA823eWe8uxGWjLSIiCDn";
var ACCESS_TOKEN = "fc6bd1f6c25471212050854e88b2d644";
var vimeo = new Vimeo(CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN);
var re = /src=\"([^\?]+)/
var template = null;


var sample = true;

const processVid = function(video) {
	if(sample) {
		console.log(video);
		sample = false;
	}

	var date = moment(video.created_time);
	var _data = {
		title: video.name,
		date: date.format("YYYY-MM-DD"),
		slug: slug(video.name)
	};

	var matches = re.exec(video.embed.html);
	if(!matches) {
		console.error("no player URL found for ", video.name)
		return;
	}
	_data.player_url = matches[1];
	
	
	if(video.description) {
		_data.description = video.description;
	}

	// Get TAGS
	var tags = [];
	var bts = false;
	video.tags.forEach(function(tag){
		if(tag.name.toLowerCase() == "bts") 
			bts = true;
		else 
			tags.push( tag.name.trim() );
	});

	if(!bts) return;

	_data.tags = JSON.stringify(tags);

	// Get POSTER IMAGE
	if(video.pictures) {
		for(n in video.pictures.sizes) {
			if(video.pictures.sizes[n].width==960) 
				_data.poster = video.pictures.sizes[n].link;

			if(video.pictures.sizes[n].width==295) 
			_data.thumbnail = video.pictures.sizes[n].link;
		}
	}

	// Generate FILENAME
	var filename = `../../_posts/bts/${_data.date}-${_data.slug}.html`;
	console.log( filename, _data );

	var result = template(_data);
	return new Promise((resolve, reject) => {
		fs.writeFile(filename, result, {flags: 'w'}, err => {
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
				var promises = body.data.map(async data => {
					return processVid(data);
				});

				Promise.all(promises).then(resolve);
			}
		});
	});
}

const loadTemplate = function() {
	return new Promise((resolve, reject) => {
		fs.readFile('bts_template.html', 'utf8', function(err, data) {
			if (err) reject(err);
			template = Handlebars.compile(data);
			resolve();
		});
	});
}

const makeBTS = async _ => {
	console.log("start");
	await loadTemplate();
	for(let page=1; page < 6; page++) {
		console.log("getting page "+page);
		await parsePage(page)
	}
	console.log("done");
}


makeBTS();

