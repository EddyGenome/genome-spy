const meta = require('./package.json');
const webpack = require('webpack');
const merge = require('webpack-merge');
const common = require('./webpack.common.js');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackInlineSourcePlugin = require('html-webpack-inline-source-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = merge(common, {
    plugins: [
        new CleanWebpackPlugin(['dist']),
        new MiniCssExtractPlugin({
            filename: '[name].css',
        }),
        new webpack.BannerPlugin({
            banner: `${meta.name} v${meta.version} - Copyright ${(new Date()).getFullYear()} ${meta.author.name}`,
        })
        //new HtmlWebpackPlugin({
        //    inlineSource: '.(js|css)$' // embed all javascript and css inline
        //}),
        //new HtmlWebpackInlineSourcePlugin()
    ],

    module: {
        rules: [
            {
                test: /\.(s?)css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'sass-loader'
                ]
            }
        ]
    }
});