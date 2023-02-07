---
layout: project
category: projects
title: Dell Technologies Club Interactive Wall
thumbnail: /images/thumbnails/dell-wall.jpg
tags: [openFrameworks, MoveNet]
description: Tracking Software for a large interactive wall
client: <a href="https://www.gensler.com/expertise/digital-experience-design">Gensler DXD</a>
role: Creative Technologist
tech:
 - openFrameworks
credits:
 - Design Director: Mandy Mandelstein (Gensler DXD) 
 - Visuals: Lars Berg (Gensler DXD)
 - Technical Producer: <a href="https://intervalstudios.com/">Joshue Ott</a>
image_root: /images/projects/dell-wall/
images: 
 - tracker-demo.gif
 - moody-center-gensler-architecture_dezeen_2364_col_1.jpg
tech:
 - <a href="https://www.edmundoptics.com/p/allied-vision-mako-g-319-1-18-inch-color-cmos-camera/33094/">Allied Vision Mako G-319 1/1.8" Color CMOS Camera</a> (with <a href="https://github.com/tyhenry/ofxVimba">ofxVimba</a>)
 - <a href="https://www.edmundoptics.com/p/35mm-c-series-fixed-focal-length-lens/31933/">3.5mm C Series Fixed Focal Length Lens</a>
 - <a href="https://www.tensorflow.org/hub/tutorials/movenet">MoveNet</a> (with <a href="https://github.com/zkmkarlsruhe/ofxTensorFlow2">ofxTensorFlow2</a>)
links: 
 - <a href="https://snadisplays.com/news/moody-center-digital-art-piece-incorporates-sound-and-movement-reactivity/">Moody Center Digital Art Pievce Incorporates Sound And Movement Reactivity</a>
 - <a href="https://www.dellblue.com/atx-moody-center">Interactive Wall at UT Moody Center</a>
---

I worked with the Gensler Austin Digital Experience Design (<a href="https://www.gensler.com/expertise/digital-experience-design">DXD</a>) team, (particularly Mandy Mandelstein) to flesh out several ideas for interactive features in the Dell Technologies Club at the <a href="https://moodycenteratx.com/">University of Texas at Austin Moody Center</a>, a new venue in Austin. 

After the concept phase, I worked on the tracking software for a 60' long interactive LED wall, located in the concourse outside of the Dell Club. During R&D, we opted for 2D cameras because of unknown lighting conditions, and GigE cameras because of the long cable runs required. Sourcing cameras in the middle of the pandemic was really tough, but eventually we landed on the Allied Vision cameras. 

I wrote software that ingests the feeds from 7 RGB cameras and then, using MoveNet, finds human forms as "skeleton data". Then the software does some blending to merge the data into one coordinate system, and then re-constructs the skeleton as silhouettes, resulting in one very long image. This single image is then fed to the front-end visuals system in order to make the wall interactive. Additional "optical flow" data is also sent to the front end to accommodate times when there are too many people in the concourse to track accurately.

The installation will be running at the Moody Center for the foreseeable future.