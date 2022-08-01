---
layout: project
category: projects
title: Pierre Huyghe, Offspring Exhibition
thumbnail: /images/thumbnails/offspring.jpg
tags: [openFrameworks, Arduino]
client: 
 - <a href="https://www.hauserwirth.com/artists/2839-pierre-huyghe/">Pierre Huyghe</a>
 - <a href="https://kunsten.dk/en">Kunsten Museum of Modern Art Aalborg</a>
links: 
 - <a href="https://kunsten.dk/en/exhibition/offspring-pierre-huyghe-13913">Kunsten Museum Announcement</a>
credits:
 - Artist: Pierre Huyghe
 - Photo: Niels Fabæk
 - Producers: Bernardita Pérez, Eduardo Pérez Infante
 - Creative Technologist: <a href="https://www.screen-club.com/">Martial Geoffre-Rouland</a>
 - AV Consultants: <a href="https://cadmos.fr/">CADMOS</a>
image_root: /images/projects/offspring
images:
 - kunsten-software-demo.gif
 - NF__8762_ok.jpg
 - NF__8765_ok.jpg
 - NF__8770.jpg
 - NF__8774_ok.jpg
tech:
 - openFrameworks
 - <a href="https://github.com/jvcleave/ofxImGui">ofxImGui</a> (thanks, Jason Van Cleave!)
 - Arduino
role: "Co-Creative Technologist"
---

I helped Pierre Huyghe and his team, Martial Geoffre-Rouland, and the Kunsten Museum mount an exhibition of some of Pierre's existing works, but in a slightly new and interconnected way. My role was to create and install some custom software that choreographed the behavior of all works and enabled the works to "talk to" each other. This involved:

<ul>
    <li>Building a custom timeline application that allowed us to visually prototype the behavior of the works before we were were on-site, as well as quickly modify the behavior of the works once we were on-site</li>
    <li>Controlling switchable glass through a network-enabled power distribution unit</li>
    <li>Interfacing with a Modulo Pi media server via OSC to control when videos were projected</li>
    <li>Analyzing audio from videos and using that data to activate another piece</li>
    <li>Re-programming masks made of LED matricies for Wifi communication so that the behavior of the masks could activate other pieces</li>
</ul>

*The exhibition Offspring is on view at Kunsten Museum, Denmark until October 30, 2022*

*Courtesy of the artist; Kunsten Museum of Modern Art, Denmark; Marian Goodman Gallery, New York; Hauser & Wirth, London*

*© Pierre Huyghe*