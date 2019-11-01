---
layout: default
category: bts
tags: ["ffmpeg","opencv"]
video: "https://player.vimeo.com/video/20308998?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=72231"
title: "Moustachizer: First attempt"
thumbnail: "https://i.vimeocdn.com/video/129625897_295x166.jpg?r=pad"
description: | 
  This is the first result of my FFMPEG plugin, The Moustachizer.  As you can see, it adds moustaches to every face it finds in the frame, and some things that aren't even faces.  I am using the basic haarcascade_frontalface_default in OpenCV and a pretty low-resolution video.  
  
  I can avoid some of the false positives by looking for eyes inside the faces.  And then I am going to add some persistence so that the moustaches aren't so jumpy. 
  
  Terrible result, but funny enough to post.
---