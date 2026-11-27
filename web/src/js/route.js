// Navigation sequence number: async views check it after every await and stop if the user has moved on.
let seq = 0;
export const nextRoute = () => ++seq;
export const currentRoute = () => seq;
