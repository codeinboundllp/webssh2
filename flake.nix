{
  description = "WebSSH2 Flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-24.11";
  };

  outputs = { self, nixpkgs, ... }:
  let 
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
  in
  {
    devShell.${system} = pkgs.mkShell {
      buildInputs = with pkgs; [
          nodejs_18
      ];
    };
  };
}
