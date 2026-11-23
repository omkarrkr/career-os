import bcrypt from "bcrypt";

// Initial benchmarked setting; remeasure on the production host under load.
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
