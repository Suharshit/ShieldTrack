export const haversine = (a:{lat:number,lng:number}, b:{lat:number,lng:number}) => {
  const R=6371000, r=Math.PI/180;
  const dLat=(b.lat-a.lat)*r, dLng=(b.lng-a.lng)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
};

export const calculateETA = (
  current:{lat:number,lng:number},
  dest:{lat:number,lng:number},
  speedHistory:number[]
): number => {
  const avg = speedHistory.slice(-5).reduce((a,b)=>a+b,0) / Math.min(speedHistory.length,5);
  if (avg < 1) return Infinity;
  return (haversine(current,dest)/1000/avg)*60;
};