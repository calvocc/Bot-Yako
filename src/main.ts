import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TypedConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // El webhook de Telegram se valida con el body crudo, asi que lo
    // conservamos para poder verificar firmas antes de parsear.
    rawBody: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();

  const config = app.get(TypedConfigService);
  const puerto = config.get('PORT');

  await app.listen(puerto, '0.0.0.0');
  new Logger('Bootstrap').log(`Yako escuchando en el puerto ${puerto}`);
}

void bootstrap();
