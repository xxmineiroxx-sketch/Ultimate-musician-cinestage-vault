import React from "react";
import renderer from "react-test-renderer";

import App from "../App";

it("renders the app root", () => {
  let tree;
  expect(() => {
    renderer.act(() => {
      tree = renderer.create(<App />);
    });
  }).not.toThrow();
  renderer.act(() => {
    tree.unmount();
  });
});
