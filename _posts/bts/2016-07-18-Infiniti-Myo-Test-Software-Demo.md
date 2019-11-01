---
layout: default
category: bts
tags: ["myo","openFrameworks"]
video: "https://player.vimeo.com/video/175295074?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=72231"
title: "Infiniti Myo Test Software Demo"
thumbnail: "https://i.vimeocdn.com/video/582373367_295x166.jpg?r=pad"
description: | 
  Here's an app to help working with data coming off the Myo armband. 
  
  https://www.dropbox.com/s/pzlhultoea3z66f/sketchMyoOutput_2016-07-18_ab58ba0.zip?dl=0
  
  There are three visual outputs to help you see what is going on:
  
  1. An axis with an arrow showing the current direction the Myo is pointing
  2. A graph showing our calculated excitement level. This graph changes color based on the following states:
  - calm: blue
  - active: green
  - excited: red
  3. Background flashes when right-to-left or left-to-right waves are detected
  
  The app also outputs OSC messages according to the sensor API document (https://docs.google.com/document/d/1qn4HZCblzYcB2YbZQIBpGvwHSWg8ne3jxWhgrbe00bw). You can edit the data/settings.json file to set the hostname and port that data is sent to. If this file isn't can't be parsed, it defaults to localhost:4634.
---