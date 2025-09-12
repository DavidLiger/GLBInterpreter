import type { DioramaConfig3DWithVideos } from "@/components/WebDioramaLoader";


export const street: DioramaConfig3DWithVideos  = {
  glb: "/models/glb/street.glb",
  pois: [
    {
      id: "start",
      label: "Vue initiale",
      emptyName: "start",
      icon: "/icons/dioramas/test_street/start.png",
      zoom: 0.5,
      lookAxis: "x",
      minDistance: 1,
      maxDistance: 20,
      minPolarAngle: 0,
      maxPolarAngle: 1.57,
      minAzimuthAngle: -3.14,
      maxAzimuthAngle: 3.14,
      enableZoom: true,
    },
    {
      id: "window",
      label: "Fenêtre appartement",
      emptyName: "window",
      icon: "/icons/dioramas/test_street/window.png",
      zoom: 0.2,
      lookAxis: "x",
      minDistance: 0.05,
      maxDistance: 0.1,
      minPolarAngle: 1,
      maxPolarAngle: 1.57,
      minAzimuthAngle: 1.14,
      maxAzimuthAngle: 2.14,
      enableZoom: true,
      children: [
        {
          id: "apartment",
          label: "Appartement",
          emptyName: "apartment",
          icon: "/icons/dioramas/test_street/apartment.png",
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.01,
          maxDistance: 0.05,
          minPolarAngle: 1,
          maxPolarAngle: 1.57,
          minAzimuthAngle: 1.14,
          maxAzimuthAngle: 2.14,
          enableZoom: true,
          children: [
            {
              id: "coffre",
              label: "Coffre",
              emptyName: "coffre",
              icon: "/icons/dioramas/test_street/coffre.png",
              zoom: 0.05,
              lookAxis: "x",
              minDistance: 0.01,
              maxDistance: 0.05,
              minPolarAngle: 1,
              maxPolarAngle: 1.57,
              minAzimuthAngle: 1.14,
              maxAzimuthAngle: 2.14,
              enableZoom: true,
            }
          ]
        },
      ],
    },
    {
      id: "window2",
      label: "Fenêtre appartement 2",
      emptyName: "window2",
      icon: "/icons/dioramas/test_street/window.png",
      zoom: 0.2,
      lookAxis: "x",
      minDistance: 0.05,
      maxDistance: 0.1,
      minPolarAngle: 1,
      maxPolarAngle: 1.57,
      minAzimuthAngle: 3.14,
      maxAzimuthAngle: 4.14,
      enableZoom: true,
    },
  ],
  videos: [
    {
      name: "TVScreen", // Nom exact dans Blender
      src: "/videos/test_street/Cab_Calloway_1933.mp4",
      materialIndex: 0, // Premier matériau
      loop: true,
      muted: true,
    },
    {
      name: "TVScreen2", // chaque objet doit avoir un material différent
      src: "/videos/test_street/Cab_Calloway_Minnie.mp4",
      autoplay: true,
    },
  ],
};

