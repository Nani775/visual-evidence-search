# Visual Evidence Search

AI-powered visual evidence investigation system that helps investigators find relevant visual targets across CCTV and video evidence.

## Live Demo

https://visual-evidence-search.vercel.app

## Problem

Searching through large amounts of CCTV footage manually is time-consuming. Investigators may need to review hours of video to find a specific person, vehicle, object, or visual target.

## Solution

Visual Evidence Search allows users to upload multiple reference images and video evidence. The system analyzes the videos and presents relevant occurrences with timestamps through an Evidence Board.

## Key Features

- Multiple reference image upload
- Video evidence upload
- AI-powered video analysis
- Visual evidence matching
- Exact timestamps for occurrences
- Jump directly to a detected moment
- Evidence Board for organizing findings

## Cloudinary

Cloudinary is an active part of the media analysis pipeline. Reference images and CCTV/video evidence are uploaded to Cloudinary, and stored video assets are analyzed using Cloudinary AI Video Analysis to generate timestamped visual information.

The application processes these results to identify relevant occurrences and allows investigators to jump directly to corresponding moments in the video.

## Technology Stack

- Next.js
- React
- TypeScript
- Cloudinary
- Cloudinary AI Video Analysis

## Important Note

The system assists investigators in locating relevant visual evidence. It does not independently establish identity, guilt, or any legal conclusion.

## Team

JRS AI