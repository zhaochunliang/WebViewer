/********************************************************************************
 #                          OpenWebGlobe Version 1.x                            #
 #                              (c) 2010-2015 by                                #
 #           University of Applied Sciences Northwestern Switzerland            #
 #                     Institute of Geomatics Engineering                       #
 #                           martin.christen@fhnw.ch                            #
 ********************************************************************************
 *     Licensed under MIT License. Read the file LICENSE for more information   *
 *******************************************************************************/

goog.provide('owg.Texture');

goog.require('goog.debug.Logger');
goog.require('owg.MathUtils');
goog.require('owg.Surface');
goog.require('owg.mat4');


/**
 * @type {string} Path to artwork, including trailing slash.
 */
owg.ARTWORK_PATH = "art/";


//------------------------------------------------------------------------------
/**
 * @class texture
 * @constructor
 * {@link http://www.openwebglobe.org}
 * @author Martin Christen martin.christen@fhnw.ch
 * @param {engine3d} engine
 * @param {boolean=} opt_useAsRenderTarget
 * @param {number=} opt_framebufferWidth
 * @param {number=} opt_framebufferHeight
 * @param {boolean=} opt_depthbuffer
 */
function Texture(engine, opt_useAsRenderTarget, opt_framebufferWidth, opt_framebufferHeight, opt_depthbuffer)
{
   /** @type {engine3d} */
   this.engine = engine;   // pointer to the engine
   /** @type {WebGLRenderingContext} */
   this.gl = engine.gl;    // pointer to the gl
   /** @type {?WebGLTexture} */
   this.texture = null;    // the texture
   /** @type {boolean} */
   this.ready = false;     // is true when texture is ready to use
   /** @type {boolean} */
   this.failed = false;    // is true when texture creation / download failed
   /** @type {Surface} */
   this.blitMesh = null;   // optional mesh used for blitting
   /** @type {number} */
   this.width = 0;
   /** @type {number} */
   this.height = 0; 
   
   /** @type {?WebGLFramebuffer} */
   this.rttFrameBuffer = null; //used if this texture is used as a render target
   /** @type {boolean} */
   this.usedAsRenderTarget = false;

   /** @type {boolean} */
   this.flip = false;

   /** @type {number} */
   var nWidth = opt_framebufferWidth || 0;
   /** @type {number} */
   var nHeight = opt_framebufferHeight || 0;
   /** @type {boolean} */
   var bDepthbuffer = opt_depthbuffer || false;

   if (opt_useAsRenderTarget)   // texture is used as render target.
   {
      this.UpdateFBO(nWidth, nHeight, bDepthbuffer);
   }
   
   /** @type {boolean} */ // PROBLEMS WITH TEXTURE COORDINATE gl.REPEAT not supported in google chrome or safari 17.10.2012
   this.repeat = false;

}
//------------------------------------------------------------------------------
/** @description create or recreate FBO
 *
 * @param {number} nWidth
 * @param {number} nHeight
 * @param {boolean} bDepthBuffer
 */
Texture.prototype.UpdateFBO = function(nWidth, nHeight, bDepthBuffer)
{
   this._DestroyFBO();

   this.rttFramebuffer = this.gl.createFramebuffer();
   this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.rttFramebuffer);
   this.rttFramebuffer.width = nWidth;
   this.rttFramebuffer.height = nHeight;

   this.texture = this.gl.createTexture();
   this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

   this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
   this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);

   this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
   this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

   this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.rttFramebuffer.width, this.rttFramebuffer.height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);

   this.renderbuffer = this.gl.createRenderbuffer();
   this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.renderbuffer);
   if (bDepthBuffer)
   {
      //this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, this.rttFramebuffer.width, this.rttFramebuffer.height);
      this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_STENCIL, this.rttFramebuffer.width, this.rttFramebuffer.height);

   }

   this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.texture, 0);

   if (bDepthBuffer)
   {
      //this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, this.renderbuffer);
      this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_STENCIL_ATTACHMENT, this.gl.RENDERBUFFER, this.renderbuffer);
   }

   this.gl.bindTexture(this.gl.TEXTURE_2D, null);
   this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
   this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

   this.ready = true;
   this.usedAsRenderTarget = true;
   this.width = nWidth;
   this.height = nHeight;
}
//------------------------------------------------------------------------------
/**
 * @description destroy FBO: Free all memory
 */
Texture.prototype._DestroyFBO = function()
{
   if (this.rttFramebuffer != null)
   {
      this.gl.deleteRenderbuffer(this.renderbuffer);
      this.renderbuffer = null;
      this.gl.deleteFramebuffer(this.rttFramebuffer);
      this.rttFramebuffer = null;
      this.gl.deleteTexture(this.texture);
      this.texture = null;

      if (this.blitMesh)
      {
         this.blitMesh.Destroy();
         this.blitMesh = null;
      }
   }
}
//------------------------------------------------------------------------------
/**
 * Loads the Texture image.
 * @param {string} url The url to download the image
 * @param {null|function(Texture)=} opt_callbackready An optional callback called when texture is ready. Has the texture class as param.
 * @param {null|function(Texture)=} opt_callbackfailed An optional callback called when texture failed. Has the texture class as param.
 * @param {boolean=} opt_flip Flip texture image on load
 */
Texture.prototype.loadTexture = function(url, opt_callbackready, opt_callbackfailed, opt_flip)
{
   // preparations
   if (goog.isDef(opt_flip))
   {
      this.flip = opt_flip;
   }
   else
   {
      this.flip = false;
   }

   this.texture = this.gl.createTexture();

   var texture=this.texture;
   var curgl = this.gl;
   var thismat = this;
   var cbr = opt_callbackready;
   var cbf = opt_callbackfailed;
   this.texture.image = new Image();
   this.texture.image["crossOrigin"] = 'anonymous';
   this.texture.image.onload = function()
   {
      _cbHandleLoadedTexture(curgl, texture, cbr, thismat);
      thismat.ready = true;
   }
   this.texture.image.onerror = function()
   {
      goog.debug.Logger.getLogger('owg.Texture').warning("***FAILED DOWNLOADING: " + url);
      this.failed = true;
      if (cbf)
      {
         cbf(thismat);
      }
   }
   this.texture.image.src = url;
   return this.texture;
}
//------------------------------------------------------------------------------
/**
 * @description Create WebGL texture object once it is available
 * @ignore
 */
function _cbHandleLoadedTexture(gl, textureobject, cb, TextureClass)
{
   // Create texture:
   gl.bindTexture(gl.TEXTURE_2D, textureobject);
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, TextureClass.flip);
   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureobject.image);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
   /*if (TextureClass.repeat) // PROBLEMS WITH TEXTURE COORDINATE gl.REPEAT not supported in google chrome or safari 17.10.2012
   {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
   }
   else
   {*/
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
   //}

   gl.bindTexture(gl.TEXTURE_2D, null);
   
   TextureClass.width = textureobject.image.width;
   TextureClass.height = textureobject.image.height;
   
   if (cb != null)
   {
      cb(TextureClass);
   }
   

}

//------------------------------------------------------------------------------
/**
 * Texture Binding, must be called before mesh.draw() called.
 *
 */
Texture.prototype.Enable = function()
{
   if (this.ready)
   {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
   }
}
//------------------------------------------------------------------------------
/**
 * Unbinds the texture
 *
 */
Texture.prototype.Disable = function()
{
   if (this.ready)
   {
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
   }
}
//------------------------------------------------------------------------------
/**
 * BlitRect(x0,y0,width,height)
 * Convienience function to draw Texture in a rectangular shape, internally using the blit function
 * @param {number} x0 Top Left x-coord
 * @param {number} y0 Top Left y-coord
 * @param {number} width The width of the rectangle
 * @param {number} height The height of the rectangle
 */
Texture.prototype.BlitRect = function(x0, y0, width, height)
{
   if (this.ready)
   {
      var scalex = width / this.width;
      var scaley = height / this.height;
      this.Blit(x0, y0, 0, 0, scalex, scaley);
   }
}
//------------------------------------------------------------------------------
/**
 * Blit Texture: Draw texture on screen
 * @param {number} x
 * @param {number} y
 * @param {number=} opt_z
 * @param {number=} opt_angle
 * @param {number=} opt_scalex
 * @param {number=} opt_scaley
 * @param {boolean=} opt_blend
 * @param {boolean=} opt_invtexcoord
 * @param {number=} opt_alpha
 * @param {vec4=} opt_color
 * @param {Texture=} opt_blendtexture
 */
Texture.prototype.Blit = function(x, y, opt_z, opt_angle, opt_scalex, opt_scaley, opt_blend, opt_invtexcoord, opt_alpha, opt_color, opt_blendtexture)
{   
   /** @type {number} */
   var z = opt_z || 0;
   /** @type {number} */
   var angle = opt_angle || 0;
   /** @type {number} */
   var scalex = opt_scalex || 1;
   /** @type {number} */
   var scaley = opt_scaley || 1;
   /** @type {boolean} */
   var blend = opt_blend || false;
   /** @type {boolean} */
   var invtexcoord = opt_invtexcoord ||false;
   /** @type {number} */
   var alpha = opt_alpha || 1.0;
   /** @type {Texture} */
   var blendtexture = opt_blendtexture || null;
   
   if (this.ready)
   {
      /** @type {number} */
      var w = this.width;
      /** @type {number} */
      var h = this.height;

      /** @type {number} */
      var xr = this.width/2;
      /** @type {number} */
      var yr = this.height/2;
      this.engine.PushMatrices();
      this.engine.SetOrtho2D();

      angle = MathUtils.Deg2Rad(angle);

      /** @type {mat4} */
      var model = new mat4();
       
       if(angle > 0)
       {
         model.SetFromArray([Math.cos(angle)*scalex, Math.sin(angle)*scaley,0,0,-Math.sin(angle)*scalex,Math.cos(angle)*scaley,0,0,0,0,1,0,-Math.cos(angle)*scalex*xr + Math.sin(angle)*scalex*yr + scalex*xr + x,-Math.cos(angle)*scaley*yr - Math.sin(angle)*scaley*xr + scaley*yr + y,z,1]);
       }
       else
       {
         model.Translation(x,y,z);

         /** @type {mat4} */
         var scaleMat = new mat4();
         scaleMat.Scale(scalex, scaley, 1.0);
         model.Multiply(model, scaleMat);
       }

      this.engine.SetModelMatrix(model);
      

      if (goog.isNull(this.blitMesh))
      {
         this.blitMesh = new Surface(this.engine);

         if (!invtexcoord)
         {
            this.blitMesh.SetBufferPoi(
               [0,0,0,   0,1,
                w,0,0,   1,1,
                w,h,0,   1,0,
                0,h,0,   0,0]);
          }
          else
          {   
             this.blitMesh.SetBufferPoi(
               [0,0,0,   0,0,
                w,0,0,   1,0,
                w,h,0,   1,1,
                0,h,0,   0,1]);
          }

         this.blitMesh.SetIndexBuffer([0,1,2,0,2,3], "TRIANGLES");
         this.blitMesh.SetTexture(this);
      }

      if (blend)
      {
         this.engine.gl.enable(this.engine.gl.BLEND);
         this.engine.gl.disable(this.engine.gl.DEPTH_TEST);
         this.engine.gl.depthFunc(this.engine.gl.LEQUAL);
         this.engine.gl.blendFunc(this.engine.gl.SRC_ALPHA,this.engine.gl.ONE_MINUS_SRC_ALPHA);
      }
      else
      {
         this.engine.gl.disable(this.engine.gl.BLEND);
      }
      
      if (alpha < 1.0)
      {
         this.engine.gl.blendColor(0,0,0,alpha);
         this.engine.gl.blendFunc(this.engine.gl.CONSTANT_ALPHA, this.engine.gl.ONE_MINUS_CONSTANT_ALPHA);
      }

      if (blendtexture)
      {
         this.gl.activeTexture(this.gl.TEXTURE1);
         this.gl.bindTexture(this.gl.TEXTURE_2D, blendtexture.texture);
      }

      this.blitMesh.Draw(null, null, null, null, opt_color);

      if (blendtexture)
      {
         this.gl.activeTexture(this.gl.TEXTURE1);
         this.gl.bindTexture(this.gl.TEXTURE_2D, null);
         this.gl.activeTexture(this.gl.TEXTURE0);
      }

      if (blend)
      {
         this.engine.gl.disable(this.engine.gl.BLEND);
         this.engine.gl.enable(this.engine.gl.DEPTH_TEST);
      }

      this.engine.PopMatrices();
   }
}
//------------------------------------------------------------------------------
/**
 * @description Free all memory, especially the GPU buffers.
 * @ignore
 */
Texture.prototype.Destroy = function()
{
   this.engine.gl.deleteTexture(this.texture);
   this.texture = null;

   this.ready = false;
   this.failed = false;

   if (this.blitMesh)
   {
      this.blitMesh.Destroy();
      this.blitMesh = null;
   }
   
   this._DestroyFBO();

}
//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
/**
 * @description Load Default Font Texture
 * @ignore
 */
Texture.prototype.LoadFontTexture = function()
{
   this.loadTexture(owg.ARTWORK_PATH + "font.png");
}
//------------------------------------------------------------------------------
/**
 * @description Load Default "empty" (nodata) texture
 * @ignore
 */
Texture.prototype.LoadNoDataTexture = function()
{
   this.loadTexture(owg.ARTWORK_PATH + "nodata.png");
}
//------------------------------------------------------------------------------
/**
 * @description Load Logo
 * @ignore
 */
Texture.prototype.LoadLogo = function()
{
   this.loadTexture(owg.ARTWORK_PATH + "sphere64.png");
}
//------------------------------------------------------------------------------
/**
 * @description Load Compass Background
 * @ignore
 */
Texture.prototype.LoadCompassBackground = function()
{
   this.loadTexture(owg.ARTWORK_PATH + "flightnavigation/cmpbg.png");
}
//------------------------------------------------------------------------------
/**
 * @description Load Compass Rose
 * @ignore
 */
Texture.prototype.LoadCompassRose = function()
{
   this.loadTexture(owg.ARTWORK_PATH + "flightnavigation/cmpr.png");
}
//------------------------------------------------------------------------------
/**
 * @description Binds the internal framebuffer if this texture is used as render target
 * In most cases this shoulnd't called directy. Use engine->PushRenderTarget(texture)
 */
Texture.prototype._EnableRenderToTexture = function()
{
   if(this.usedAsRenderTarget)
   {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.rttFramebuffer);      
      this.gl.viewport(0, 0, this.rttFramebuffer.width, this.rttFramebuffer.height);
   }  
}
//------------------------------------------------------------------------------
/**
 * @description unbinds the internal framebuffer if this texture is used as render target
 * In most cases this shoulnd't called directy. Use engine->PopRenderTarget()
 */
Texture.prototype._DisableRenderToTexture = function()
{
    //this.gl.bindTexture(this.gl.TEXTURE_2D, rttTexture);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);      
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); 
    this.gl.viewport(0, 0, this.engine.width, this.engine.height);
}
//------------------------------------------------------------------------------
/**
 * @description copies the texture
 * param {Texture} texture
 */
 Texture.prototype.CopyFrom = function(texture)
 {
   this.texture = texture.texture;    
   this.ready = texture.ready;
   
   this.failed = texture.failed;   
   this.blitMesh = texture.blitMesh;  
   this.width = texture.blitMesh;
   this.height = texture.blitMesh; 
 }
 
goog.exportSymbol('Texture', Texture);
goog.exportProperty(Texture.prototype, 'CopyFrom', Texture.prototype.CopyFrom);
goog.exportProperty(Texture.prototype, 'Blit', Texture.prototype.Blit);
goog.exportProperty(Texture.prototype, '_EnableRenderToTexture', Texture.prototype._EnableRenderToTexture);
goog.exportProperty(Texture.prototype, '_DisableRenderToTexture', Texture.prototype._DisableRenderToTexture);
