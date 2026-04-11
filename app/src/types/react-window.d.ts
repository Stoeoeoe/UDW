declare module 'react-window' {
  import * as React from 'react';

  export type GridChildComponentProps = {
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
    data?: any;
  };

  export class FixedSizeGrid extends React.Component<any> {}

  export class FixedSizeList extends React.Component<any> {}

  export {};
}
