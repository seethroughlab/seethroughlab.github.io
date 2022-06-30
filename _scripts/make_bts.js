const Vimeo = require('vimeo').Vimeo;
var fs = require('fs');
var jp = require('jsonpath');

const CLIENT_ID="b26ea60915fb663983cab75ae8fbaf56c47ecff3";
const CLIENT_SECRET = "3fcJ4nTQ6kv67ee20+gkChAqR7WLy2UQ0MhyB1nQITV6RuWtlqwPMEOPZrqdLiXQZ2xqOSJRyNMa+xQKZtSUf3dduLuEwZyKOc8mO2XmRi9JA823eWe8uxGWjLSIiCDn";
const ACCESS_TOKEN = "622cb5cd626b59cd27591e966e1cffa6";
const vimeo = new Vimeo(CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN);
const POSTS = [];

async function parse_video(video) {
    if(video.privacy.view=="password")
        return;

    var images = jp.query(video.pictures, '$.sizes[?(@.width>600)]');

    const content = {};
    content.date = new Date(video.created_time);
    content.title = video.name;
    content.link = video.player_embed_url;
    if(video.tags.length>0)     content.tags = video.tags.map(t => t.name.trim());
    if(video.description)       content.description = video.description;
    if(images.length>0)         content.thumbnail = images[0].link;

    POSTS.push(content);
}

async function parse_page(path) {
    return new Promise((resolve, reject) => {
        vimeo.request({'method': 'GET', "path": path}, async function(error, body){
            if(error) {
                resolve(false);
            } else {
                for(const vid of body.data) {
                    await parse_video(vid);
                }
                resolve(body.data.length > 0);
            }
        });
    });
}

async function make_bts() {
    var more = true;
    var n = 1;
    do {
        const page = `/users/jeffcrouse/videos?sort=date&per_page=100&page=${n}`;
		console.log(`getting page ${page}`);
		more = await parse_page(page);
        console.log(`${POSTS.length} posts`);
        n++;
    } while(more);

    const content = JSON.stringify(POSTS, null, 2);
    await fs.promises.writeFile(`../js/bts.json`, content);
}

make_bts();