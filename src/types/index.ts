export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "agent" | "viewer";
}

export interface Agent {
  id: string;
  name: string;
  type: "voz" | "texto";
}
