# Native default dome resource

StinsonBeach.hdr is copied byte-for-byte from OpenUSD26.11.1, commit96c1989167d2aaab5bd34627f32a321a6b79866b, pxr/imaging/hdx/textures/StinsonBeach.hdr. Native hdx/CMakeLists.txt:102 bundles it; hdx/package.cpp:157-169 returns it when the optional .tex image reader is unavailable. It retains the upstream OpenUSD license and notice provided at package root.

SHA256: 4897697c757edc524dc9b7bcc692e8e05a7f02dbede3e30d2291dc0831dece17
