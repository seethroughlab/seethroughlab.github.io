Math.clamp = function(num, min, max) {
	if(min>max) console.warn("Math.clamp: min > max");
	return Math.min(Math.max(num, min), max);
};
Math.map = function (value, istart, istop, ostart, ostop, clamp) {
	var val = ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
	return clamp ? Math.clamp(val, Math.min(ostart, ostop), Math.max(ostart, ostop)) : val;
}

var width = 120;
var height = 120;

var scene = new THREE.Scene();
var camera = new THREE.OrthographicCamera( width / - 2, width / 2, height / 2, height / - 2, 1, 1000 );
camera.position.z =1;

scene.add(camera);

var renderer = new THREE.WebGLRenderer();
renderer.setSize( width, height );
var element = document.getElementById("logo");
element.appendChild( renderer.domElement );


var composer = new THREE.EffectComposer( renderer );
var renderPass = new THREE.RenderPass( scene, camera );
var rgbPass = new THREE.ShaderPass( THREE.RGBShiftShader );
var copyPass = new THREE.ShaderPass( THREE.CopyShader );

composer.addPass( renderPass );
composer.addPass( rgbPass );
composer.addPass( copyPass );
copyPass.renderToScreen = true;


var textures = {
	front: new THREE.TextureLoader().load('/images/front.png'),
	back: new THREE.TextureLoader().load('/images/back.png')
};
for(var key in textures) 
	textures[key].minFilter = THREE.LinearFilter;

var materials = {
	front:  new THREE.MeshBasicMaterial({map: textures.front, transparent: true, opacity: 1}),
	back:  new THREE.MeshBasicMaterial({map: textures.back, transparent: true, opacity: 1})
}
var geo = new THREE.PlaneGeometry( width-10, height-10, 1, 1 );
var meshes = {
	front: new THREE.Mesh( geo, materials.front ),
	back: new THREE.Mesh( geo, materials.back ),
}

for(var key in meshes) 
    scene.add( meshes[key] );


var mouse = {x: 0, y:0 };
document.onmousemove = function(e) {
    mouse.x = e.pageX;
    mouse.y = e.pageY;
};

var offset = height/100;
var HALF_PI = Math.PI / 2.0;
function animate() {

	rgbPass.uniforms[ "angle" ].value = Math.map(mouse.x, 0, width, -HALF_PI, HALF_PI);
	rgbPass.uniforms[ "amount" ].value = Math.map(mouse.y, 0, height, -.01, .01);


	meshes.front.position.y = Math.map(mouse.y, 0, height, -offset, offset);
	meshes.back.position.y = Math.map(mouse.y, 0, height, offset, -offset);

    requestAnimationFrame( animate );
    //renderer.render( scene, camera );
    composer.render( 0.1 );
}
animate();