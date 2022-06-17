---
layout: portfolio-single-small-slider
title: Light Echoes Barbican
thumbnail: /images/thumbnails/light_echoes.jpg
tags : [openFrameworks, Canon, DMX, lasers]
category: projects
description: Enter a new world and watch as a single laser projects a sculptural wall of light around the space of The Curve. Moving slowly, frame by frame, follow the light to its finale, a stunning visual rendering of data transformed into a wordscape.
role: Technical Lead
video_player: https://player.vimeo.com/video/134693404
video_poster: https://i.vimeocdn.com/video/528306121_1920x1080.jpg?r=pad
client:
 - <a href="http://toolofna.com/#!/director/ben-tricklebank">Ben Tricklebank</a>
 - Aaron Koblin
 - <a href="http://www.barbican.org.uk/artgallery">The Barbican Gallery</a>
links: 
 - <a href="http://www.digitalartsonline.co.uk/news/interactive-design/experience-immersive-light-echoes-installation-at-barbican-curve-gallery/#3">Aaron Koblin and Ben Tricklebank's Light Echoes is an amazing, immersive installation at The Barbican</a>
 - <a href="http://www.designindaba.com/articles/creative-work/light-echoes-installation-arrives-barbican-curve-gallery">Light Echoes installation arrives at the Barbican Curve Gallery</a>
credits:
 - Director: Ben Tricklebank
 - Director: Aaron Koblin
 - Video: Ben Tricklebank
tech: 
 - <a href="http://www.kvant-laser.eu/handbuch/atom801/handbuch_atom_801_englisch.pdf">Kvant ATOM 801</a>
 - <a href="http://www.enttec.com/index.php?main_menu=Products&pn=70314">Enttec PRO Mk2</a>
 - Canon 5D Mark III
 - DMX RGB par lights
 - DMX-controlled ceiling-mounted motor track
 - custom openFrameworks software with <a href="https://github.com/memo/ofxIlda">ofxIlda</a> and <a href="https://github.com/jefftimesten/ofxEdsdk">ofxEdsdk</a>
---

	
[Barbican website](http://www.barbican.org.uk/music/event-detail.asp?ID=18300)


Back in March, I was approached by director Ben Tricklebank and artist Aaron Koblin and asked to be the technical lead and developer for an installation that was to be part of Doug Aitken’s Station to Station event at the Barbican Gallery in London. This would be the second incarnation of the event. The first took place on a train moving across the USA. The original Light Echoes project consisted of "a series of long-exposure photos taken while a laser shot a series of images from a slow-moving rig onto a train-track terrain”.  

The new version is currently taking place in the iconic Barbican Curve Gallery, and, unlike the original version, this one is open to the public for three months. The installation consists of a laser projector on a 60-foot motorized track mounted on the ceiling. While the laser moves through the gallery, it “paints” an image line by line. The instant the laser starts to move and project, we open the shutter on a 5D Mark III and keep it open for over 3 minutes. Users are invited to follow behind the laser, leaving shadows in the image that become a permanent part of the installation.

All of this meant that the camera had to be automated and timed very precisely with the motor that moved the laser. To accomplish this, I use the Canon EDSDK along with openFrameworks, a creative coding toolkit. This allowed me to put the camera into bulb mode and “press” and “release” the shutter button with software, then immediately access the photo that was taken and add it to a stop-motion video shown at the end of the gallery. 
