
// https://www.seattlecfug.org/demos/cubePortfolio-ColdFusion-SQL/assets/cubeportfolio/documentation/index.html
const grid = $("#portfolio-container-grid");
var perpage;
var posts = [];
const n = parseInt(window.location.hash.replace("#", ""));
var start = Number.isInteger(n) ? n : 0;

grid.on('initComplete.cbp', function() {
	$.getJSON("/js/bts.json", function( data, textStatus, jqxhr ) {
		posts = data;
		perpage = Math.min(posts.length, 30);
		populate();
	});
});

async function clear() {
	return new Promise((resolve, reject) => {
		grid.cubeportfolio('remove', $(".cbp-item"), resolve);
	});
}

function make_html(post) {
	return `<div class="cbp-item ${post.tags ? post.tags.join(" ") : ""}">                                                            
		<a class="cbp-caption cbp-lightbox" data-title="${post.title}" href="${post.link}">
			<div class="cbp-caption-defaultWrap">
			
				<picture>
					<source srcset="${post.thumbnail}.webp" type="image/webp">	
					<img src="data:image/gif;base64,R0lGODlhAQABAPAAAP///////yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==" data-cbp-src="${post.thumbnail}" width="640" height="360">
				</picture>	

			</div>
			<div class="cbp-caption-activeWrap">
				<div class="cbp-l-caption-alignLeft">
					<div class="cbp-l-caption-body">
						<div class="cbp-l-caption-title">${post.title}</div>
						<div class="cbp-l-caption-desc">${new Date(post.date).toLocaleDateString("en-US")}</div>
					</div>
				</div>
			</div>
		</a>
	</div>`;
}


async function populate() {
	await clear();
	var html = "";
	posts.slice(start, start + perpage).forEach(post => {html += make_html(post);}) // TODO: refactor to reduce() 
	grid.cubeportfolio('append', html);
}

addEventListener('hashchange', populate);

$("#next").click(function(e){
	start = Math.min(start+perpage, posts.length);
	window.location.hash = `#${start}`;
	e.preventDefault();
});

$("#prev").click(function(e){
	start = Math.max(0, start-perpage);
	window.location.hash = `#${start}`;
	e.preventDefault();
});